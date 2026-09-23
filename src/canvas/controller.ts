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
import { nearestSegment } from '../geometry/wall';
import { type CatalogStamp, cycleVariantIndex, effectiveProperties } from '../stamps/catalog';
import { pileSpec, type PileSpec } from '../tools/containers';
import { hasDocs, NO_DOCS, type DoorState, type GeneratedDocs, type LightDoc, type RegionDoc, type TileDoc, type WallDoc } from '../tools/documents';
import { isDoorStamp, snapDoorToRooms, stampDoorState } from '../tools/doors';
import { DrawSession, type DrawMode } from '../tools/draw-session';
import { deletePoint, movePoint } from '../tools/edit';
import { withDocs, type Feature } from '../tools/feature';
import { featureHit } from '../tools/hit';
import { findLevel, type Level, levelElevation, nextLevelBand, onLevel, sortLevels } from '../tools/levels';
import { DEFAULT_HALF_WIDTH, makePath, type PathKind } from '../tools/path';
import { planDocuments } from '../tools/plan';
import { makeRegion, type BiomeKind } from '../tools/region';
import { makeRoom, withRoomDoors } from '../tools/room';
import { makeStamp, stampCentre, withStampFrame, withStampVariant, type StampFeature, type StampPlacement } from '../tools/stamp';
import { DEFAULT_BRUSH_RADIUS, makeStroke } from '../tools/stroke';
import { exitRegion, exitSquare, type SceneFrame, type SubmapLink } from '../tools/submap';
import type { FeatureRenderer } from './renderer';

export interface SceneStore {
    load: () => Feature[];
    save: (features: readonly Feature[]) => Promise<void>;
}

/** Resolves a catalog key to its stamp across every loaded pack. */
export interface StampCatalog {
    get: (key: string) => CatalogStamp | null;
}

/** Traces an image's opaque silhouette into closed loops of footprint fractions (0..1), or null if it cannot. */
export interface SilhouetteSource {
    trace: (src: string) => Promise<Point[][] | null>;
}

/**
 * The scene's levels. On Foundry v14 these are the scene's native Level
 * documents; on v13 they are recorded in a scene flag.
 */
export interface LevelStore {
    load: () => Level[];
    create: (level: Omit<Level, 'id'>) => Promise<string | null>;
    update: (id: string, patch: Partial<Omit<Level, 'id'>>) => Promise<void>;
    remove: (id: string) => Promise<void>;
}

/** The world's scenes, for submaps: the one being edited, others to link, new interiors, their exit regions. */
export interface WorldScenes {
    /** The scene being edited. */
    current: () => { readonly id: string; readonly name: string } | null;
    name: (sceneId: string) => string | null;
    frame: (sceneId: string) => SceneFrame | null;
    /** Create an empty interior scene named `name`, gridded like the current one; returns its id. */
    createScene: (name: string) => Promise<string | null>;
    /** Create one region in another scene, with the id it names. */
    createRegion: (sceneId: string, region: RegionDoc) => Promise<boolean>;
    deleteRegion: (sceneId: string, regionId: string) => Promise<void>;
}

/** Item Piles containers backing container stamps; unavailable (and inert) when Item Piles is not active. */
export interface ContainerService {
    available: () => boolean;
    /** Create a container pile named `name`; returns its token UUID. */
    create: (spec: PileSpec, name: string) => Promise<string | null>;
    move: (pile: string, spec: PileSpec) => Promise<void>;
    remove: (pile: string) => Promise<void>;
}

/** Everything the controller is injected with: rendering, persistence, document creation, levels, scenes, containers, packs, ids. */
export interface ControllerPorts {
    readonly renderer: FeatureRenderer;
    readonly store: SceneStore;
    readonly sink: DocumentSink;
    readonly levels: LevelStore;
    readonly scenes: WorldScenes;
    readonly containers: ContainerService;
    readonly catalog: StampCatalog;
    readonly silhouettes: SilhouetteSource;
    readonly makeId: () => string;
}

/** A tile's frame as Foundry reports it: unrotated top-left, size, rotation about the centre. */
export interface TileFrame {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly rotation: number;
}

export interface TileUpdate {
    readonly id: string;
    readonly tile: TileDoc;
}

/** Creates, updates and deletes the native Foundry documents features generate. Returns created ids in input order. */
export interface DocumentSink {
    createWalls: (walls: readonly WallDoc[]) => Promise<string[]>;
    createLights: (lights: readonly LightDoc[]) => Promise<string[]>;
    createTiles: (tiles: readonly TileDoc[]) => Promise<string[]>;
    updateTiles: (updates: readonly TileUpdate[]) => Promise<void>;
    /** Create regions, wiring each `teleport.targets` index to the created region it names. */
    createRegions: (regions: readonly RegionDoc[]) => Promise<string[]>;
    deleteDocuments: (docs: GeneratedDocs) => Promise<void>;
}

export type Brush =
    | { readonly type: 'path'; readonly kind: PathKind }
    | { readonly type: 'region'; readonly biome: BiomeKind }
    | { readonly type: 'stroke'; readonly biome: BiomeKind }
    | { readonly type: 'room'; readonly floor: BiomeKind };

/** Cap on retained undo snapshots — bounds memory on a long editing session. */
const MAX_HISTORY = 50;

/** A door stamp placed within this many grid squares of a room wall snaps onto it. */
const DOOR_SNAP_SQUARES = 0.5;

function swap(arr: Feature[], a: number, b: number): void {
    const first = arr[a];
    const second = arr[b];
    if (first !== undefined && second !== undefined) {
        arr[a] = second;
        arr[b] = first;
    }
}

/** Pair existing tile ids with their new specs, index by index. */
function pairTiles(ids: readonly string[], tiles: readonly TileDoc[]): TileUpdate[] {
    const updates: TileUpdate[] = [];
    ids.forEach((id, i) => {
        const tile = tiles[i];
        if (tile) {
            updates.push({ id, tile });
        }
    });
    return updates;
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

    private readonly renderer: FeatureRenderer;
    private readonly store: SceneStore;
    private readonly sink: DocumentSink;
    private readonly levelStore: LevelStore;
    private readonly scenes: WorldScenes;
    private readonly containers: ContainerService;
    private readonly catalog: StampCatalog;
    private readonly silhouettes: SilhouetteSource;
    private readonly makeId: () => string;

    private levelList: Level[] = [];
    /** The level being edited: new features land on it, and only its features (and level-less ones) show. */
    private active: string | null = null;

    constructor(ports: ControllerPorts) {
        this.renderer = ports.renderer;
        this.store = ports.store;
        this.sink = ports.sink;
        this.levelStore = ports.levels;
        this.scenes = ports.scenes;
        this.containers = ports.containers;
        this.catalog = ports.catalog;
        this.silhouettes = ports.silhouettes;
        this.makeId = ports.makeId;
    }

    /** An enterable stamp, or null for anything else. */
    private enterable(id: string): StampFeature | null {
        const feature = this.getFeature(id);
        return feature?.type === 'stamp' && feature.behaviour.enterable ? feature : null;
    }

    /** The interior an enterable stamp leads into, or null. */
    submapOf(id: string): SubmapLink | null {
        return this.enterable(id)?.submap ?? null;
    }

    /**
     * Link an enterable stamp to `sceneId` as its interior: an exit region
     * goes into the interior (one square at its centre, for the GM to move)
     * and an entrance region over the stamp, each teleporting to the other.
     * A previous link is undone first. False if the stamp is not enterable, or
     * either scene is missing.
     */
    async linkSubmap(id: string, sceneId: string): Promise<boolean> {
        const stamp = this.enterable(id);
        const here = this.scenes.current();
        const frame = this.scenes.frame(sceneId);
        const sceneName = this.scenes.name(sceneId);
        if (!stamp || !here || !frame || sceneName === null || sceneId === here.id) {
            return false;
        }
        if (stamp.submap) {
            await this.scenes.deleteRegion(stamp.submap.scene, stamp.submap.exitRegion);
        }
        const link: SubmapLink = { scene: sceneId, sceneName, entryRegion: this.makeId(), exitRegion: this.makeId() };
        if (!(await this.scenes.createRegion(sceneId, exitRegion(link, exitSquare(frame), here.id, here.name)))) {
            return false;
        }
        await this.replaceFeature(id, { ...stamp, submap: link });
        return true;
    }

    /** Create a new, empty interior scene named `name` and link the stamp to it; returns the scene id. */
    async createInterior(id: string, sceneName: string): Promise<string | null> {
        if (!this.enterable(id)) {
            return null;
        }
        const sceneId = await this.scenes.createScene(sceneName);
        return sceneId !== null && (await this.linkSubmap(id, sceneId)) ? sceneId : null;
    }

    /** Remove a stamp's interior link and both of its regions (the interior scene itself is kept). */
    async unlinkSubmap(id: string): Promise<boolean> {
        const stamp = this.enterable(id);
        if (!stamp?.submap) {
            return false;
        }
        await this.scenes.deleteRegion(stamp.submap.scene, stamp.submap.exitRegion);
        await this.replaceFeature(id, { ...stamp, submap: null });
        return true;
    }

    /** The scene's levels, bottom to top. */
    get levels(): readonly Level[] {
        return this.levelList;
    }

    get activeLevel(): string | null {
        return this.active;
    }

    /** Edit on `id` (null: every level). Redraws to show only that level's features. */
    setActiveLevel(id: string | null): void {
        this.active = id !== null && findLevel(this.levelList, id) ? id : null;
        this.redraw();
    }

    /** Re-read the levels (after an outside edit, e.g. a GM changing a native Level) and re-sync what depends on them. */
    async reloadLevels(): Promise<void> {
        const before = this.levelList;
        this.levelList = sortLevels(this.levelStore.load());
        if (findLevel(this.levelList, this.active) === null) {
            this.active = null;
        }
        if (JSON.stringify(before) !== JSON.stringify(this.levelList)) {
            await this.resyncLevelled();
            this.redraw();
        }
    }

    /** Add a level stacked above (or below) the existing ones and make it active; returns its id. */
    async addLevel(position: 'above' | 'below', levelName: string): Promise<string | null> {
        const id = await this.levelStore.create({ name: levelName, ...nextLevelBand(this.levelList, position) });
        await this.reloadLevels();
        if (id !== null) {
            this.setActiveLevel(id);
        }
        return id;
    }

    async renameLevel(id: string, levelName: string): Promise<void> {
        if (findLevel(this.levelList, id) && levelName.trim() !== '') {
            await this.levelStore.update(id, { name: levelName.trim() });
            await this.reloadLevels();
        }
    }

    /** Move a level's elevation band; everything on it (and transitions touching it) re-syncs. */
    async setLevelBand(id: string, bottom: number, ceiling: number): Promise<boolean> {
        if (!findLevel(this.levelList, id) || !(ceiling > bottom)) {
            return false;
        }
        await this.levelStore.update(id, { bottom, top: ceiling });
        await this.reloadLevels();
        return true;
    }

    /** How many features sit on each level. */
    levelCounts(): Record<string, number> {
        const counts: Record<string, number> = {};
        for (const f of this.features) {
            if (f.level !== null) {
                counts[f.level] = (counts[f.level] ?? 0) + 1;
            }
        }
        return counts;
    }

    /** Remove an empty level; refuses (false) while features sit on it, so nothing is orphaned. */
    async removeLevel(id: string): Promise<boolean> {
        if (!findLevel(this.levelList, id) || (this.levelCounts()[id] ?? 0) > 0) {
            return false;
        }
        await this.levelStore.remove(id);
        await this.reloadLevels();
        return true;
    }

    /** Re-sync every feature whose documents depend on the levels: anything on a level, and every transition stamp. */
    private async resyncLevelled(): Promise<void> {
        const levelled = this.features.filter((f) => f.level !== null);
        await levelled.reduce(async (previous, f) => {
            await previous;
            await this.syncDocs(this.getFeature(f.id) ?? f);
        }, Promise.resolve());
    }

    private visible(feature: Feature): boolean {
        return onLevel(feature.level, this.active);
    }

    /** Draw a feature if it is on the active level, otherwise make sure it is not drawn. */
    private show(feature: Feature): void {
        if (this.visible(feature)) {
            this.renderer.set(feature.id, feature);
        } else {
            this.renderer.remove(feature.id);
        }
    }

    /** Trace the stamp's silhouette when its occlusion asks for one; otherwise it carries none. */
    private async withSilhouette(stamp: StampFeature): Promise<StampFeature> {
        if (stamp.behaviour.occlusion?.shape !== 'alpha') {
            return { ...stamp, silhouette: null };
        }
        return { ...stamp, silhouette: await this.silhouettes.trace(stamp.src) };
    }

    /** Scene px per grid square for stamp footprints; a gridless scene uses the pack's own reference grid. */
    private stampGrid(stamp: CatalogStamp): number {
        return this.grid?.size ?? stamp.referenceGridSize;
    }

    /** Place a catalog stamp; returns the new feature id, or null if the stamp is not in any loaded pack. */
    async placeStamp(placement: StampPlacement): Promise<string | null> {
        const stamp = this.catalog.get(placement.stamp);
        if (!stamp) {
            return null;
        }
        const placed = makeStamp(this.makeId(), stamp, placement, this.stampGrid(stamp));
        // A door dropped near a room wall lands on it, so its axis cuts the wall cleanly.
        const feature = await this.withSilhouette(snapDoorToRooms(placed, this.features, placed.gridSize * DOOR_SNAP_SQUARES));
        await this.add(await this.withPile({ ...feature, level: feature.level ?? this.active }, stamp.name));
        return feature.id;
    }

    /** Back a container stamp with an Item Piles container, when Item Piles is available. */
    private async withPile(stamp: StampFeature, pileName: string): Promise<StampFeature> {
        if (!stamp.behaviour.container || !this.containers.available()) {
            return stamp;
        }
        return { ...stamp, pile: await this.containers.create(pileSpec(stamp, levelElevation(this.levelList, stamp.level)), pileName) };
    }

    /**
     * Follow a door opened, closed or locked in play: switch the door stamp
     * that owns `wallId` to a variant showing `state`. Returns false when the
     * wall is not a door stamp's, it already shows that state, or no variant
     * does.
     */
    async applyDoorState(wallId: string, state: DoorState): Promise<boolean> {
        const feature = this.features.find((f) => f.docs.walls.includes(wallId));
        const stamp = feature && isDoorStamp(feature) ? this.catalog.get(feature.stamp) : null;
        if (!feature || !isDoorStamp(feature) || !stamp || stampDoorState(feature) === state) {
            return false;
        }
        const index = stamp.variants.findIndex((_, i) => (effectiveProperties(stamp, i).doorState ?? 'closed') === state);
        return index >= 0 && this.setStampVariant(feature.id, index);
    }

    /** Switch a placed stamp to variant `index` (clamped); false if it is not a stamp or its pack is gone. */
    async setStampVariant(id: string, index: number): Promise<boolean> {
        const feature = this.getFeature(id);
        const stamp = feature?.type === 'stamp' ? this.catalog.get(feature.stamp) : null;
        if (feature?.type !== 'stamp' || !stamp) {
            return false;
        }
        await this.replaceFeature(id, await this.withSilhouette(withStampVariant(feature, stamp, index, this.stampGrid(stamp))));
        return true;
    }

    /** Step a placed stamp to its next (or previous) variant, wrapping. */
    async cycleStampVariant(id: string, direction: 1 | -1 = 1): Promise<boolean> {
        const feature = this.getFeature(id);
        const stamp = feature?.type === 'stamp' ? this.catalog.get(feature.stamp) : null;
        if (feature?.type !== 'stamp' || !stamp) {
            return false;
        }
        return this.setStampVariant(id, cycleVariantIndex(stamp, feature.variant, direction));
    }

    /** The feature that owns a native tile, or null for a tile the plugin did not generate. */
    featureForTile(tileId: string): string | null {
        return this.features.find((f) => f.docs.tiles.includes(tileId))?.id ?? null;
    }

    /**
     * Adopt a GM's native edit of a stamp's tile (move, resize, rotate) and
     * re-sync its other documents. Returns false when nothing changed, which
     * ends the update loop our own tile write triggers.
     */
    async syncStampFrame(id: string, frame: TileFrame): Promise<boolean> {
        const feature = this.getFeature(id);
        if (feature?.type !== 'stamp') {
            return false;
        }
        const centre = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
        const current = stampCentre(feature);
        const unchanged =
            current.x === centre.x &&
            current.y === centre.y &&
            feature.width === frame.width &&
            feature.height === frame.height &&
            feature.rotation === frame.rotation;
        if (unchanged) {
            return false;
        }
        await this.replaceFeature(id, withStampFrame(feature, { centre, width: frame.width, height: frame.height, rotation: frame.rotation }));
        return true;
    }

    get drawing(): boolean {
        return this.session !== null;
    }

    load(): void {
        this.features = this.store.load();
        this.levelList = sortLevels(this.levelStore.load());
        if (findLevel(this.levelList, this.active) === null) {
            this.active = null;
        }
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
        await this.add(feature);
    }

    /** Add a committed feature: onto the active level unless it names its own, render, persist, then generate its documents. */
    async add(input: Feature): Promise<void> {
        const feature = input.level === null && this.active !== null ? { ...input, level: this.active } : input;
        this.snapshot();
        const before = [...this.features];
        this.features.push(feature);
        this.show(feature);
        await this.store.save(this.features);
        await this.syncDocs(feature);
        await this.resyncDependents(before, [feature]);
    }

    async remove(id: string): Promise<void> {
        const target = this.features.find((f) => f.id === id);
        if (!target) {
            return;
        }
        this.snapshot();
        const before = this.features;
        this.features = this.features.filter((f) => f.id !== id);
        this.renderer.remove(id);
        await this.store.save(this.features);
        if (hasDocs(target.docs)) {
            await this.sink.deleteDocuments(target.docs);
        }
        // A linked stamp's exit lives in its interior scene; it goes with the stamp.
        if (target.type === 'stamp' && target.submap) {
            await this.scenes.deleteRegion(target.submap.scene, target.submap.exitRegion);
        }
        if (target.type === 'stamp' && target.pile !== null) {
            await this.containers.remove(target.pile);
        }
        await this.resyncDependents(before, [target]);
    }

    /** The features shown on the active level, topmost (last drawn) first: what pointer picks consider. */
    private topDown(): Feature[] {
        return this.features.filter((f) => this.visible(f)).reverse();
    }

    /** Topmost shown feature under `pt`, or null. */
    hitTest(pt: Point): string | null {
        return this.topDown().find((f) => featureHit(f, pt))?.id ?? null;
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
        for (const f of this.topDown()) {
            const { index, distance } = nearestVertex(pt, f.points);
            if (index >= 0 && distance <= tol) {
                return { id: f.id, index };
            }
        }
        return null;
    }

    /** The topmost room wall segment within `tol` of `pt`: its room id + segment index, or null. */
    pickWallSegment(pt: Point, tol: number): { id: string; index: number } | null {
        for (const f of this.topDown()) {
            if (f.type !== 'room') {
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
        const before = this.features;
        this.features = this.features.map((f) => (f.id === id ? next : f));
        this.show(next);
        await this.store.save(this.features);
        await this.syncDocs(next);
        if (next.type === 'stamp' && next.pile !== null) {
            // The container token follows the stamp.
            await this.containers.move(next.pile, pileSpec(next, levelElevation(this.levelList, next.level)));
        }
        await this.resyncDependents(before, [old, next]);
    }

    /**
     * Re-sync the features whose plan depends on others that just changed: a
     * door stamp added, moved or removed changes the openings in room walls.
     * Only rooms whose planned walls actually differ are touched.
     */
    private async resyncDependents(before: readonly Feature[], changed: readonly Feature[]): Promise<void> {
        if (!changed.some(isDoorStamp)) {
            return;
        }
        const wallsOf = (room: Feature, features: readonly Feature[]): string =>
            JSON.stringify(planDocuments(room, { features, levels: this.levelList }).walls);
        const affected = this.features.filter((f) => f.type === 'room' && wallsOf(f, before) !== wallsOf(f, this.features));
        // Sequential: each sync reads and persists the shared feature list, so concurrent syncs would race.
        await affected.reduce(async (previous, room) => {
            await previous;
            await this.syncDocs(this.getFeature(room.id) ?? room);
        }, Promise.resolve());
    }

    /**
     * Bring a feature's native documents in line with its plan: tiles are
     * updated in place when the count is unchanged (keeping their ids, and
     * anything a GM set on them), everything else is replaced. Records the
     * resulting ids on the feature and persists.
     */
    private async syncDocs(feature: Feature): Promise<void> {
        const plan = planDocuments(feature, { features: this.features, levels: this.levelList });
        const old = feature.docs;
        const planned = plan.walls.length + plan.lights.length + plan.tiles.length + plan.regions.length;
        if (planned === 0 && !hasDocs(old)) {
            return;
        }
        const keepTiles = old.tiles.length > 0 && old.tiles.length === plan.tiles.length;
        await this.sink.deleteDocuments({ ...old, tiles: keepTiles ? [] : old.tiles });
        let tiles: readonly string[];
        if (keepTiles) {
            await this.sink.updateTiles(pairTiles(old.tiles, plan.tiles));
            tiles = old.tiles;
        } else {
            tiles = plan.tiles.length > 0 ? await this.sink.createTiles(plan.tiles) : [];
        }
        const docs: GeneratedDocs = {
            ...NO_DOCS,
            walls: plan.walls.length > 0 ? await this.sink.createWalls(plan.walls) : [],
            lights: plan.lights.length > 0 ? await this.sink.createLights(plan.lights) : [],
            tiles,
            regions: plan.regions.length > 0 ? await this.sink.createRegions(plan.regions) : [],
        };
        this.features = this.features.map((f) => (f.id === feature.id ? withDocs(f, docs) : f));
        await this.store.save(this.features);
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
            if (this.visible(f)) {
                this.renderer.set(f.id, f);
            }
        }
    }
}
