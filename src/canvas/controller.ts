// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Orchestrates a drawing session against a renderer, a persistence store, and a
 * wall emitter — all injected interfaces, so the whole flow (begin → point →
 * preview → commit → save → walls, plus load/remove) is unit-tested with fakes
 * and never touches Foundry directly. Handles both brushes: path (road/river)
 * and region (biome).
 */
import type { Point } from '../geometry/spline';
import { DrawSession, type DrawMode } from '../tools/draw-session';
import type { Feature } from '../tools/feature';
import { DEFAULT_HALF_WIDTH, makePath, type CartographyPath, type PathKind } from '../tools/path';
import { makeRegion, type BiomeKind } from '../tools/region';
import type { FeatureRenderer } from './renderer';

export interface SceneStore {
    load(): Feature[];
    save(features: readonly Feature[]): Promise<void>;
}

export interface WallEmitter {
    emit(path: CartographyPath): Promise<void>;
}

export type Brush = { readonly type: 'path'; readonly kind: PathKind } | { readonly type: 'region'; readonly biome: BiomeKind };

export class CartographyController {
    private features: Feature[] = [];
    private session: DrawSession | null = null;
    private brush: Brush | null = null;

    /** Half-width (scene px) applied to newly drawn paths. */
    halfWidth = DEFAULT_HALF_WIDTH;
    /** Whether committed paths also emit Foundry walls along their centerline. */
    emitWalls = false;

    constructor(
        private readonly renderer: FeatureRenderer,
        private readonly store: SceneStore,
        private readonly wallEmitter: WallEmitter,
        private readonly makeId: () => string,
    ) {}

    get drawing(): boolean {
        return this.session !== null;
    }

    load(): void {
        this.features = this.store.load();
        this.redraw();
    }

    begin(brush: Brush, mode: DrawMode): void {
        this.brush = brush;
        this.session = new DrawSession(mode);
    }

    addPoint(p: Point): void {
        if (!this.session) {
            return;
        }
        this.session.addPoint(p);
        const preview = this.buildFeature('__preview__');
        if (preview) {
            this.renderer.preview(preview);
        }
    }

    cancel(): void {
        this.session = null;
        this.brush = null;
        this.renderer.clearPreview();
    }

    async commit(): Promise<void> {
        const feature = this.buildFeature(this.makeId());
        this.session = null;
        this.brush = null;
        this.renderer.clearPreview();
        if (!feature) {
            return;
        }
        this.features.push(feature);
        this.renderer.set(feature.id, feature);
        await this.store.save(this.features);
        if (feature.type === 'path' && feature.walls) {
            await this.wallEmitter.emit(feature);
        }
    }

    async remove(id: string): Promise<void> {
        const before = this.features.length;
        this.features = this.features.filter((f) => f.id !== id);
        if (this.features.length === before) {
            return;
        }
        this.renderer.remove(id);
        await this.store.save(this.features);
    }

    private buildFeature(id: string): Feature | null {
        if (!this.session || !this.brush) {
            return null;
        }
        const pts = this.session.simplified();
        if (this.brush.type === 'path') {
            return makePath(id, this.brush.kind, pts, this.halfWidth, this.emitWalls);
        }
        return makeRegion(id, this.brush.biome, pts);
    }

    private redraw(): void {
        this.renderer.clear();
        for (const f of this.features) {
            this.renderer.set(f.id, f);
        }
    }
}
