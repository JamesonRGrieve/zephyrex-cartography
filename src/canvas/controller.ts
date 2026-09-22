// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Orchestrates a drawing session against a renderer, a persistence store, and a
 * wall emitter — all injected interfaces, so the whole flow (begin → point →
 * preview → commit → save → walls, plus load/remove) is unit-tested with fakes
 * and never touches Foundry directly.
 */
import type { Point } from '../geometry/spline';
import { DEFAULT_HALF_WIDTH, type CartographyPath, type PathKind } from '../tools/path';
import { DrawSession, type DrawMode } from '../tools/draw-session';
import { PREVIEW_STYLE, STYLES, type RibbonRenderer } from './renderer';

export interface SceneStore {
    load(): CartographyPath[];
    save(paths: readonly CartographyPath[]): Promise<void>;
}

export interface WallEmitter {
    emit(path: CartographyPath): Promise<void>;
}

export class CartographyController {
    private paths: CartographyPath[] = [];
    private session: DrawSession | null = null;

    /** Half-width (scene px) applied to newly drawn paths. */
    halfWidth = DEFAULT_HALF_WIDTH;
    /** Whether committed paths also emit Foundry walls along their centerline. */
    emitWalls = false;

    constructor(
        private readonly renderer: RibbonRenderer,
        private readonly store: SceneStore,
        private readonly wallEmitter: WallEmitter,
        private readonly makeId: () => string,
    ) {}

    get drawing(): boolean {
        return this.session !== null;
    }

    load(): void {
        this.paths = this.store.load();
        this.redraw();
    }

    begin(kind: PathKind, mode: DrawMode): void {
        this.session = new DrawSession(kind, mode);
    }

    addPoint(p: Point): void {
        if (!this.session) {
            return;
        }
        this.session.addPoint(p);
        if (this.session.pointCount >= 2) {
            this.renderer.setPreview(this.session.points, this.halfWidth, PREVIEW_STYLE);
        }
    }

    cancel(): void {
        this.session = null;
        this.renderer.clearPreview();
    }

    async commit(): Promise<void> {
        const session = this.session;
        this.session = null;
        this.renderer.clearPreview();
        if (!session) {
            return;
        }
        const path = session.finalize(this.makeId(), this.halfWidth, this.emitWalls);
        if (!path) {
            return;
        }
        this.paths.push(path);
        this.renderer.set(path.id, path, STYLES[path.kind]);
        await this.store.save(this.paths);
        if (path.walls) {
            await this.wallEmitter.emit(path);
        }
    }

    async remove(id: string): Promise<void> {
        const before = this.paths.length;
        this.paths = this.paths.filter((p) => p.id !== id);
        if (this.paths.length === before) {
            return;
        }
        this.renderer.remove(id);
        await this.store.save(this.paths);
    }

    private redraw(): void {
        this.renderer.clear();
        for (const p of this.paths) {
            this.renderer.set(p.id, p, STYLES[p.kind]);
        }
    }
}
