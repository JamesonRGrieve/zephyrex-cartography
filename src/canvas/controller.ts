// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Orchestrates a drawing session against a renderer, a persistence store, and a
 * wall emitter — all injected interfaces, so the whole flow (begin → point →
 * preview → commit → save → walls, plus load/remove) is unit-tested with fakes
 * and never touches Foundry directly. Handles both brushes: path (road/river)
 * and region (biome).
 */
import { nearestVertex } from '../geometry/hit';
import { snapToGrid, type Grid } from '../geometry/snap';
import type { Point } from '../geometry/spline';
import { centroid, nearestSegment, type WallSpec } from '../geometry/wall';
import { DrawSession, type DrawMode } from '../tools/draw-session';
import { deletePoint, movePoint } from '../tools/edit';
import type { Feature } from '../tools/feature';
import { featureHit } from '../tools/hit';
import { DEFAULT_HALF_WIDTH, makePath, type CartographyPath, type PathKind } from '../tools/path';
import { makeRegion, type BiomeKind } from '../tools/region';
import { makeRoom, roomWalls, withRoomDoors, withRoomLights, withRoomWalls, type RoomFeature } from '../tools/room';
import { DEFAULT_BRUSH_RADIUS, makeStroke } from '../tools/stroke';
import type { FeatureRenderer } from './renderer';

export interface SceneStore {
    load: () => Feature[];
    save: (features: readonly Feature[]) => Promise<void>;
}

export interface WallEmitter {
    emit: (path: CartographyPath) => Promise<void>;
    /** Create native Foundry walls (some flagged as doors); returns their document ids. */
    emitSegments: (walls: readonly WallSpec[]) => Promise<string[]>;
    /** Delete native Foundry walls by document id. */
    deleteWalls: (ids: readonly string[]) => Promise<void>;
}

export interface LightEmitter {
    /** Create a native Foundry ambient light at (x, y); returns its document id or null. */
    emitLight: (x: number, y: number) => Promise<string | null>;
    /** Delete native Foundry ambient lights by document id. */
    deleteLights: (ids: readonly string[]) => Promise<void>;
}

export type Brush =
    | { readonly type: 'path'; readonly kind: PathKind }
    | { readonly type: 'region'; readonly biome: BiomeKind }
    | { readonly type: 'stroke'; readonly biome: BiomeKind }
    | { readonly type: 'room'; readonly floor: BiomeKind };

/** Cap on retained undo snapshots — bounds memory on a long editing session. */
const MAX_HISTORY = 50;

function swap(arr: Feature[], a: number, b: number): void {
    const first = arr[a];
    const second = arr[b];
    if (first !== undefined && second !== undefined) {
        arr[a] = second;
        arr[b] = first;
    }
}

/** Do two feature lists carry the same ids in the same order? */
function sameOrder(a: readonly Feature[], b: readonly Feature[]): boolean {
    if (a.length !== b.length) {
        return false;
    }
    return a.every((f, i) => f.id === b[i]?.id);
}

export class CartographyController {
    private features: Feature[] = [];
    private session: DrawSession | null = null;
    private brush: Brush | null = null;
    private readonly history: Feature[][] = [];
    private future: Feature[][] = [];

    /** Half-width (scene px) applied to newly drawn paths. */
    halfWidth = DEFAULT_HALF_WIDTH;
    /** Radius (scene px) applied to newly painted terrain strokes. */
    brushRadius = DEFAULT_BRUSH_RADIUS;
    /** Scene grid for snapping room vertices; null disables snapping. */
    grid: Grid | null = null;
    /** Whether committed paths also emit Foundry walls along their centerline. */
    emitWalls = false;

    constructor(
        private readonly renderer: FeatureRenderer,
        private readonly store: SceneStore,
        private readonly wallEmitter: WallEmitter,
        private readonly lightEmitter: LightEmitter,
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
        // Rooms snap to the scene grid so their walls meet cleanly; other tools stay freeform.
        const point = this.grid && this.brush?.type === 'room' && this.session.mode === 'click' ? snapToGrid(p, this.grid) : p;
        this.session.addPoint(point);
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
        this.snapshot();
        this.features.push(feature);
        this.renderer.set(feature.id, feature);
        await this.store.save(this.features);
        if (feature.type === 'path' && feature.walls) {
            await this.wallEmitter.emit(feature);
        }
        if (feature.type === 'room') {
            // Rooms generate native Foundry walls + a centre light; track their ids for lifecycle sync.
            const synced = await this.syncRoomDocs(feature);
            this.features = this.features.map((f) => (f.id === feature.id ? synced : f));
            await this.store.save(this.features);
        }
    }

    async remove(id: string): Promise<void> {
        const target = this.features.find((f) => f.id === id);
        if (!target) {
            return;
        }
        this.snapshot();
        this.features = this.features.filter((f) => f.id !== id);
        this.renderer.remove(id);
        await this.store.save(this.features);
        if (target.type === 'room') {
            await this.deleteRoomDocs(target);
        }
    }

    /** Topmost feature under `pt`, or null — scans front-to-back (render order). */
    hitTest(pt: Point): string | null {
        for (let i = this.features.length - 1; i >= 0; i--) {
            const f = this.features[i];
            if (f && featureHit(f, pt)) {
                return f.id;
            }
        }
        return null;
    }

    /** Remove the topmost feature under `pt`; returns whether one was erased. */
    async erase(pt: Point): Promise<boolean> {
        const id = this.hitTest(pt);
        if (id === null) {
            return false;
        }
        await this.remove(id);
        return true;
    }

    /** The feature with `id`, or null (read-only; used for edit previews). */
    getFeature(id: string): Feature | null {
        return this.features.find((f) => f.id === id) ?? null;
    }

    /** The topmost feature vertex within `tol` of `pt`: its feature id + vertex index, or null. */
    pickVertex(pt: Point, tol: number): { id: string; index: number } | null {
        for (let i = this.features.length - 1; i >= 0; i--) {
            const f = this.features[i];
            if (!f) {
                continue;
            }
            const { index, distance } = nearestVertex(pt, f.points);
            if (index >= 0 && distance <= tol) {
                return { id: f.id, index };
            }
        }
        return null;
    }

    /** The topmost room wall segment within `tol` of `pt`: its room id + segment index, or null. */
    pickWallSegment(pt: Point, tol: number): { id: string; index: number } | null {
        for (let i = this.features.length - 1; i >= 0; i--) {
            const f = this.features[i];
            if (f?.type !== 'room') {
                continue;
            }
            const { index, distance } = nearestSegment(pt, f.points);
            if (index >= 0 && distance <= tol) {
                return { id: f.id, index };
            }
        }
        return null;
    }

    /** Toggle whether a room's perimeter segment is a door; re-syncs the native walls. */
    async toggleDoor(id: string, index: number): Promise<boolean> {
        const f = this.getFeature(id);
        if (f?.type !== 'room') {
            return false;
        }
        const doors = f.doors.includes(index) ? f.doors.filter((d) => d !== index) : [...f.doors, index];
        await this.replaceFeature(id, withRoomDoors(f, doors));
        return true;
    }

    /** Move a control point of a committed feature; false if the edit is invalid. */
    async moveVertex(id: string, index: number, to: Point): Promise<boolean> {
        const f = this.getFeature(id);
        if (!f) {
            return false;
        }
        const next = movePoint(f, index, to);
        if (!next) {
            return false;
        }
        await this.replaceFeature(id, next);
        return true;
    }

    /** Render a transient preview of a vertex move (drag feedback), without persisting. */
    previewVertexMove(id: string, index: number, to: Point): void {
        const f = this.getFeature(id);
        if (!f) {
            return;
        }
        const moved = movePoint(f, index, to);
        if (moved) {
            this.renderer.preview(moved);
        }
    }

    /** Clear any transient preview (end of a drag). */
    clearPreview(): void {
        this.renderer.clearPreview();
    }

    /** Delete a control point; false if invalid or it would drop below the minimum. */
    async deleteVertex(id: string, index: number): Promise<boolean> {
        const f = this.getFeature(id);
        if (!f) {
            return false;
        }
        const next = deletePoint(f, index);
        if (!next) {
            return false;
        }
        await this.replaceFeature(id, next);
        return true;
    }

    async undo(): Promise<void> {
        const prev = this.history.pop();
        if (!prev) {
            return;
        }
        this.future.push([...this.features]);
        this.features = prev;
        await this.store.save(this.features);
        this.redraw();
    }

    async redo(): Promise<void> {
        const next = this.future.pop();
        if (!next) {
            return;
        }
        this.history.push([...this.features]);
        this.features = next;
        await this.store.save(this.features);
        this.redraw();
    }

    async toFront(id: string): Promise<void> {
        await this.reorder(id, (arr, i) => {
            const [f] = arr.splice(i, 1);
            if (f) {
                arr.push(f);
            }
        });
    }

    async toBack(id: string): Promise<void> {
        await this.reorder(id, (arr, i) => {
            const [f] = arr.splice(i, 1);
            if (f) {
                arr.unshift(f);
            }
        });
    }

    async raise(id: string): Promise<void> {
        await this.reorder(id, (arr, i) => {
            if (i < arr.length - 1) {
                swap(arr, i, i + 1);
            }
        });
    }

    async lower(id: string): Promise<void> {
        await this.reorder(id, (arr, i) => {
            if (i > 0) {
                swap(arr, i, i - 1);
            }
        });
    }

    /** Swap the feature with `id` for `next`, snapshotting for undo, then persist + redraw it. */
    private async replaceFeature(id: string, next: Feature): Promise<void> {
        const old = this.features.find((f) => f.id === id);
        if (!old) {
            return;
        }
        this.snapshot();
        this.features = this.features.map((f) => (f.id === id ? next : f));
        this.renderer.set(id, next);
        await this.store.save(this.features);
        if (next.type === 'room') {
            // Re-sync native docs: drop the room's old walls/lights, re-emit from the new geometry.
            if (old.type === 'room') {
                await this.deleteRoomDocs(old);
            }
            const synced = await this.syncRoomDocs(next);
            this.features = this.features.map((f) => (f.id === id ? synced : f));
            await this.store.save(this.features);
        }
    }

    /** Emit a room's native Foundry walls + centre light, returning the room stamped with their ids. */
    private async syncRoomDocs(room: RoomFeature): Promise<RoomFeature> {
        const wallIds = await this.wallEmitter.emitSegments(roomWalls(room));
        const c = centroid(room.points);
        const lightId = await this.lightEmitter.emitLight(c.x, c.y);
        return withRoomLights(withRoomWalls(room, wallIds), lightId !== null ? [lightId] : []);
    }

    /** Delete the native Foundry walls + lights a room generated. */
    private async deleteRoomDocs(room: RoomFeature): Promise<void> {
        if (room.wallIds.length > 0) {
            await this.wallEmitter.deleteWalls(room.wallIds);
        }
        if (room.lightIds.length > 0) {
            await this.lightEmitter.deleteLights(room.lightIds);
        }
    }

    /** Record the current feature list for undo, capped, and drop the redo stack. */
    private snapshot(): void {
        this.history.push([...this.features]);
        if (this.history.length > MAX_HISTORY) {
            this.history.shift();
        }
        this.future = [];
    }

    /** Apply an in-place reordering `move` to a copy, persisting + redrawing if it changed. */
    private async reorder(id: string, move: (arr: Feature[], i: number) => void): Promise<void> {
        const i = this.features.findIndex((f) => f.id === id);
        if (i < 0) {
            return;
        }
        const next = [...this.features];
        move(next, i);
        if (sameOrder(next, this.features)) {
            return;
        }
        this.snapshot();
        this.features = next;
        await this.store.save(this.features);
        this.redraw();
    }

    private buildFeature(id: string): Feature | null {
        if (!this.session || !this.brush) {
            return null;
        }
        const pts = this.session.simplified();
        if (this.brush.type === 'path') {
            return makePath(id, this.brush.kind, pts, this.halfWidth, this.emitWalls);
        }
        if (this.brush.type === 'region') {
            return makeRegion(id, this.brush.biome, pts);
        }
        if (this.brush.type === 'room') {
            return makeRoom(id, this.brush.floor, pts);
        }
        return makeStroke(id, this.brush.biome, pts, this.brushRadius);
    }

    private redraw(): void {
        this.renderer.clear();
        for (const f of this.features) {
            this.renderer.set(f.id, f);
        }
    }
}
