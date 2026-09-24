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
import { centroid, nearestSegment } from '../geometry/wall';
import { type CatalogStamp, cycleVariantIndex, effectiveProperties } from '../stamps/catalog';
import type { BiomeKind } from '../tools/biome';
import { pileSpec, type PileSpec } from '../tools/containers';
import { hasDocs, NO_DOCS, type DoorState, type GeneratedDocs, type RegionDoc, type SubmapTravel, type TileDoc } from '../tools/documents';
import { isDoorStamp, snapDoorToRooms, stampDoorState } from '../tools/doors';
import { DrawSession, type DrawMode } from '../tools/draw-session';
import { deletePoint, movePoint, setHalfWidth } from '../tools/edit';
import { withDocs, type Feature } from '../tools/feature';
import { featureHit } from '../tools/hit';
import {
    findLevel,
    type Level,
    type LevelArt,
    levelElevation,
    levelHeightFor,
    nextLevelBand,
    NO_LEVEL_ART,
    onLevel,
    planningLevels,
    sortLevels,
} from '../tools/levels';
import type { FloorMaterial, WallMaterial } from '../tools/materials';
import { drawOrder } from '../tools/nesting';
import { DEFAULT_HALF_WIDTH, LIQUID_LOOKS, makePath, type PathKind, type RiverLook } from '../tools/path';
import { NO_PLAN, type PlanContext, planDocuments } from '../tools/plan';
import { makeRegion } from '../tools/region';
import {
    type DoorSettings,
    doorOn,
    makeRoom,
    NEW_DOOR,
    type RoomDoor,
    type RoomFeature,
    type RoomMaterials,
    roomMaterialsOf,
    withRoomDoor,
    withRoomLit,
    withRoomMaterials,
} from '../tools/room';
import { hasSceneSettings, type SceneSettings } from '../tools/scene-settings';
import { blankMask, channelFor, type MaskRect, maskLength, maskPoint, newSplatLayer, paintDab, type SplatLayer } from '../tools/splat';
import { makeStamp, stampCentre, withStampFrame, withStampVariant, type StampFeature, type StampPlacement } from '../tools/stamp';
import { DEFAULT_BRUSH_RADIUS, makeStroke } from '../tools/stroke';
import { DEFAULT_TRAVEL, exitRegion, exitSquare, type SceneFrame, type SubmapLink } from '../tools/submap';
import { sameTarget, type SwitchTarget, toggleTarget } from '../tools/switch-targets';
import { lampVariant, switchOf } from '../tools/switches';
import { NORMAL_COST, storedCost } from '../tools/terrain-cost';
import type { WallPreset } from '../tools/wall-presets';
import type { FeatureRenderer } from './renderer';
import { type DocumentKind, StagedChanges, type StagedWrite } from './staged-changes';

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

/** The scene's levels: its native Level documents. */
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
    /** Give a region in another scene the teleport `region` plans, leaving its shape as it is. */
    updateTeleport: (sceneId: string, region: RegionDoc) => Promise<void>;
    /** Change the current scene's settings: only those given. */
    updateSettings: (settings: SceneSettings) => Promise<void>;
}

/** Item Piles containers backing container stamps; unavailable (and inert) when Item Piles is not active. */
export interface ContainerService {
    available: () => boolean;
    /** Create a container pile named `name`; returns its token UUID. */
    create: (spec: PileSpec, name: string) => Promise<string | null>;
    move: (pile: string, spec: PileSpec) => Promise<void>;
    remove: (pile: string) => Promise<void>;
}

/** The scene's splat maps: their layers (in the scene flag) and each one's mask pixels (a PNG in the world's data). */
export interface SplatStore {
    load: () => SplatLayer[];
    save: (layers: readonly SplatLayer[]) => Promise<void>;
    /** A layer's saved mask, or null when it has none yet or it cannot be read. */
    readMask: (layer: SplatLayer) => Promise<Uint8ClampedArray<ArrayBuffer> | null>;
    writeMask: (layer: SplatLayer, mask: Uint8ClampedArray<ArrayBuffer>) => Promise<void>;
    /** Where a new splat map for `level` saves its mask. */
    pathFor: (level: string | null) => string;
}

/** Draws splat maps, one per key (a level, or "" for every level). */
export interface SplatRenderer {
    set: (key: string, layer: SplatLayer, mask: Uint8ClampedArray) => void;
    /** Redraw the part of `key`'s mask a brush just changed. */
    update: (key: string, rect: MaskRect) => void;
    remove: (key: string) => void;
}

/** A level's splat map: its layer and its mask's pixels. */
interface Splat {
    readonly layer: SplatLayer;
    readonly mask: Uint8ClampedArray<ArrayBuffer>;
}

/** A step undo can take back: the feature list as it was, or a level's splat map before a blend stroke. */
type HistoryEntry = { readonly kind: 'features'; readonly features: readonly Feature[] } | ({ readonly kind: 'blend'; readonly key: string } & Splat);

/** A splat map's key: its level, or "" for one on every level. */
function splatKey(level: string | null): string {
    return level ?? '';
}

/** A blend brush dab, in scene terms. */
export interface BlendDab {
    readonly at: Point;
    /** The texture role painted. */
    readonly role: string;
    /** Scene px. */
    readonly radius: number;
    /** 0–1 per dab. */
    readonly strength: number;
    readonly erase: boolean;
}

/** Everything the controller is injected with: rendering, persistence, document creation, levels, scenes, containers, packs, ids. */
export interface ControllerPorts {
    readonly renderer: FeatureRenderer;
    readonly splats: SplatStore;
    readonly splatRenderer: SplatRenderer;
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

/**
 * Writes the native Foundry documents features generate. The controller
 * stages each transaction's changes (see {@link StagedChanges}) and hands
 * them over whole, to be written atomically.
 */
export interface DocumentSink {
    /** A fresh id for a document of `kind` about to be created. */
    newId: (kind: DocumentKind) => string;
    /** Delete, create and update everything in `write`, in one transaction: all of it lands, or none. */
    write: (write: StagedWrite) => Promise<void>;
}

export type Brush =
    | { readonly type: 'path'; readonly kind: PathKind }
    | { readonly type: 'region'; readonly biome: BiomeKind }
    | { readonly type: 'stroke'; readonly biome: BiomeKind }
    | { readonly type: 'room'; readonly floor: FloorMaterial; readonly wall?: WallMaterial; readonly wallKind?: WallPreset; readonly ceiling?: boolean };

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

/** Pair existing document ids with their new specs, index by index. */
function pairDocs<T>(ids: readonly string[], docs: readonly T[]): { readonly id: string; readonly doc: T }[] {
    return ids.flatMap((id, i) => {
        const doc = docs[i];
        return doc === undefined ? [] : [{ id, doc }];
    });
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
    private readonly history: HistoryEntry[] = [];
    private future: HistoryEntry[] = [];
    /** Each level's splat map, by key. */
    private readonly splats = new Map<string, Splat>();
    /** The splat map as the blend stroke under way found it, for undo; null between strokes. */
    private blendStart: (Splat & { readonly key: string }) | null = null;
    /** Inside {@link batch}: edits share the batch's one undo snapshot. */
    private batching = false;
    /** Document changes waiting for the current transaction to end. */
    private readonly staged: StagedChanges;
    /** Depth of nested transactions; only the outermost one writes. */
    private writing = 0;

    /** Half-width (scene px) applied to newly drawn paths. */
    halfWidth = DEFAULT_HALF_WIDTH;
    /** The look of newly drawn rivers: liquid, shade and bed. */
    riverLook: RiverLook = LIQUID_LOOKS.water;
    /** Radius (scene px) applied to newly painted terrain strokes. */
    brushRadius = DEFAULT_BRUSH_RADIUS;
    /** Movement cost of newly painted areas and strokes (1: ordinary ground). */
    movementCost = NORMAL_COST;
    /** Scene grid for snapping room vertices; null disables snapping. */
    grid: Grid | null = null;
    /** The kind of Foundry walls newly drawn paths put along their centerline, or null for none. */
    pathWalls: WallPreset | null = null;
    /**
     * Scene distance units per grid square; the entry sets it from the scene's
     * grid. 0 (no grid) leaves new levels at the default height and stamp
     * heights unknown.
     */
    gridDistance = 0;

    private readonly renderer: FeatureRenderer;
    private readonly splatStore: SplatStore;
    private readonly splatRenderer: SplatRenderer;
    private readonly store: SceneStore;
    private readonly sink: DocumentSink;
    private readonly levelStore: LevelStore;
    private readonly scenes: WorldScenes;
    private readonly containers: ContainerService;
    private readonly catalog: StampCatalog;
    private readonly silhouettes: SilhouetteSource;
    private readonly makeId: () => string;

    private levelList: Level[] = [];
    private terrainRegions = false;
    /** The level being edited: new features land on it, and only its features (and level-less ones) show. */
    private active: string | null = null;

    constructor(ports: ControllerPorts) {
        this.renderer = ports.renderer;
        this.splatStore = ports.splats;
        this.splatRenderer = ports.splatRenderer;
        this.store = ports.store;
        this.sink = ports.sink;
        this.levelStore = ports.levels;
        this.scenes = ports.scenes;
        this.containers = ports.containers;
        this.catalog = ports.catalog;
        this.silhouettes = ports.silhouettes;
        this.makeId = ports.makeId;
        this.staged = new StagedChanges((kind) => ports.sink.newId(kind));
    }

    /** An enterable stamp, or null for anything else. */
    private enterable(id: string): StampFeature | null {
        const feature = this.getFeature(id);
        return feature?.type === 'stamp' && feature.behaviour.enterable ? feature : null;
    }

    /** The levels of an enterable stamp's floors in this scene, bottom to top; empty for none. */
    buildingFloors(id: string): readonly string[] {
        return this.enterable(id)?.floors ?? [];
    }

    /**
     * Give a building its floors in this scene: one Level per name, stacked
     * above the scene's top level, and stairs over its footprint joining its
     * own level to all of them. A building on every level stands on the
     * lowest from then on, since its floors climb from there. More can be
     * added later, above. False for a stamp that is not enterable, or a scene
     * with no levels.
     */
    async addBuildingFloors(id: string, names: readonly string[]): Promise<boolean> {
        const stamp = this.enterable(id);
        const ground = stamp && (findLevel(this.levelList, stamp.level) ?? this.levelList[0] ?? null);
        if (!stamp || !ground || names.length === 0) {
            return false;
        }
        const created = await names.reduce(async (built, levelName) => {
            const ids = await built;
            const levelId = await this.levelStore.create({
                name: levelName,
                ...nextLevelBand(this.levelList, 'above', levelHeightFor(this.gridDistance)),
                art: NO_LEVEL_ART,
            });
            this.levelList = sortLevels(this.levelStore.load());
            return levelId === null ? ids : [...ids, levelId];
        }, Promise.resolve<string[]>([]));
        await this.reloadLevels();
        await this.replaceFeature(id, { ...stamp, level: ground.id, floors: [...stamp.floors, ...created] });
        return created.length > 0;
    }

    /** Take away a building's stairs to its floors; the floors themselves stay, for the GM to remove from the levels panel. */
    async removeBuildingFloors(id: string): Promise<boolean> {
        const stamp = this.enterable(id);
        if (!stamp || stamp.floors.length === 0) {
            return false;
        }
        await this.replaceFeature(id, { ...stamp, floors: [] });
        return true;
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
    async linkSubmap(id: string, sceneId: string, travel: SubmapTravel = DEFAULT_TRAVEL): Promise<boolean> {
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
        const link: SubmapLink = { scene: sceneId, sceneName, entryRegion: this.makeId(), exitRegion: this.makeId(), travel };
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

    /**
     * Change how tokens travel through a stamp's interior link, both ways. The
     * entrance re-syncs with the stamp; the exit, which the GM may have moved,
     * is updated where it is. False for a stamp with no link.
     */
    async setSubmapTravel(id: string, travel: SubmapTravel): Promise<boolean> {
        const stamp = this.enterable(id);
        const here = this.scenes.current();
        if (!stamp?.submap || !here) {
            return false;
        }
        const link = { ...stamp.submap, travel };
        await this.replaceFeature(id, { ...stamp, submap: link });
        await this.scenes.updateTeleport(link.scene, exitRegion(link, [], here.id, here.name));
        return true;
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

    /** What plans read besides the feature: the scene's features (by default the live ones), levels and options. */
    private planContext(features: readonly Feature[] = this.features): PlanContext {
        return { features, levels: this.levelList, terrainRegions: this.terrainRegions, gridDistance: this.gridDistance };
    }

    /** Whether terrain is mirrored as Scene Regions. */
    get terrainAsRegions(): boolean {
        return this.terrainRegions;
    }

    /**
     * Mirror terrain (biome regions and brush strokes) as Scene Regions, or
     * stop, and bring the scene in line. Also run after loading a scene, which
     * may have been last edited under the other setting.
     */
    async setTerrainRegions(on: boolean): Promise<void> {
        this.terrainRegions = on;
        // Only terrain whose regions disagree with its plan is re-synced (difficult ground keeps its region either way).
        const stale = this.features.filter(
            (f) => (f.type === 'region' || f.type === 'stroke') && f.docs.regions.length !== planDocuments(f, this.planContext()).regions.length,
        );
        await this.transaction(async () =>
            stale.reduce(async (previous, f) => {
                await previous;
                await this.syncDocs(this.getFeature(f.id) ?? f);
            }, Promise.resolve()),
        );
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
        await this.transaction(async () => {
            await this.dropOrphans();
            if (planningLevels(before) !== planningLevels(this.levelList)) {
                await this.resyncLevelled();
            }
        });
        this.redraw();
    }

    /** Add a level stacked above (or below) the existing ones and make it active; returns its id. */
    async addLevel(position: 'above' | 'below', levelName: string): Promise<string | null> {
        const id = await this.levelStore.create({
            name: levelName,
            ...nextLevelBand(this.levelList, position, levelHeightFor(this.gridDistance)),
            art: NO_LEVEL_ART,
        });
        await this.reloadLevels();
        if (id !== null) {
            this.setActiveLevel(id);
        }
        return id;
    }

    /**
     * Change the scene's own settings (darkness, fog, weather and so on): only
     * those given. They are the scene's, not features, so undo leaves them be.
     */
    async setSceneSettings(settings: SceneSettings): Promise<void> {
        if (hasSceneSettings(settings)) {
            await this.scenes.updateSettings(settings);
        }
    }

    /** Set a level's own background, foreground and fog images; false for an unknown level. */
    async setLevelArt(id: string, art: LevelArt): Promise<boolean> {
        if (!findLevel(this.levelList, id)) {
            return false;
        }
        await this.levelStore.update(id, { art });
        await this.reloadLevels();
        return true;
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

    /**
     * Drop the features of a level that no longer exists. Foundry deletes a
     * Level's own placeables with it, so their documents are already gone;
     * anything they own elsewhere (an interior exit, a pile) is discarded, and
     * they leave the undo history too, so nothing is revived onto a missing
     * level.
     */
    private async dropOrphans(): Promise<void> {
        const orphaned = (f: Feature): boolean => f.level !== null && findLevel(this.levelList, f.level) === null;
        const orphans = this.features.filter(orphaned);
        if (orphans.length === 0) {
            return;
        }
        const before = this.features;
        this.features = this.features.filter((f) => !orphaned(f));
        for (const f of orphans) {
            this.renderer.remove(f.id);
        }
        // A blend on a level that is gone has nothing left to undo onto.
        const prune = (entries: readonly HistoryEntry[]): HistoryEntry[] =>
            entries.flatMap((entry): HistoryEntry[] => {
                if (entry.kind === 'features') {
                    return [{ kind: 'features', features: entry.features.filter((f) => !orphaned(f)) }];
                }
                return entry.layer.level !== null && findLevel(this.levelList, entry.layer.level) === null ? [] : [entry];
            });
        this.history.splice(0, this.history.length, ...prune(this.history));
        this.future = prune(this.future);
        await this.store.save(this.features);
        await Promise.all(orphans.map(async (f) => this.discard(f)));
        await this.resyncDependents(before, orphans);
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
        if (feature.type === 'room') {
            // A room can change what nests in what, so the whole draw order is rebuilt.
            this.redraw();
        } else if (this.visible(feature)) {
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
        if (feature?.type === 'room') {
            return this.recordRoomDoorState(feature, wallId, state);
        }
        const stamp = feature && isDoorStamp(feature) ? this.catalog.get(feature.stamp) : null;
        if (!feature || !isDoorStamp(feature) || !stamp || stampDoorState(feature) === state) {
            return false;
        }
        const index = stamp.variants.findIndex((_, i) => (effectiveProperties(stamp, i).doorState ?? 'closed') === state);
        if (index < 0) {
            return false;
        }
        const lightSwitch = switchOf(feature);
        if (!lightSwitch) {
            return this.setStampVariant(feature.id, index);
        }
        // A light switch flipped in play: the switch and everything it lights change together, as one undo step.
        await this.batch(async () => {
            await this.setStampVariant(lightSwitch.id, index);
            await this.applySwitch(lightSwitch, state === 'open');
        });
        return true;
    }

    /** Turn everything `switchFeature` controls on or off. */
    private async applySwitch(switchFeature: StampFeature, on: boolean): Promise<void> {
        await switchFeature.switchTargets.reduce(async (previous, target) => {
            await previous;
            if (target.kind === 'light') {
                this.staged.setLightVisibility(target.id, !on);
                return;
            }
            const feature = this.getFeature(target.id);
            if (feature?.type === 'room') {
                if (feature.lit !== on) {
                    await this.replaceFeature(feature.id, withRoomLit(feature, on));
                }
                return;
            }
            const lamp = feature?.type === 'stamp' ? this.catalog.get(feature.stamp) : null;
            const variant = lamp ? lampVariant(lamp, on) : null;
            if (feature?.type === 'stamp' && variant !== null && variant !== feature.variant) {
                await this.setStampVariant(feature.id, variant);
            }
        }, Promise.resolve());
    }

    isLightSwitch(id: string): boolean {
        return switchOf(this.getFeature(id)) !== null;
    }

    /** Where a switch or its target is, for drawing the link between them: a stamp's centre, a room's centroid. */
    featureCentre(id: string): Point | null {
        const feature = this.getFeature(id);
        if (feature?.type === 'stamp') {
            return stampCentre(feature);
        }
        return feature?.type === 'room' ? centroid(feature.points) : null;
    }

    /** What light switch `id` controls; empty for any other feature. */
    switchTargets(id: string): readonly SwitchTarget[] {
        return switchOf(this.getFeature(id))?.switchTargets ?? [];
    }

    /**
     * Link `target` to light switch `id`, or unlink it if it is linked. A
     * feature target must be a lamp stamp (one with lit and unlit variants) or
     * a room; false for anything else, or when `id` is not a switch.
     */
    async toggleSwitchTarget(id: string, target: SwitchTarget): Promise<boolean> {
        const switchFeature = switchOf(this.getFeature(id));
        if (!switchFeature || (target.kind === 'feature' && !this.switchable(target.id))) {
            return false;
        }
        await this.replaceFeature(id, { ...switchFeature, switchTargets: toggleTarget(switchFeature.switchTargets, target) });
        return true;
    }

    /** Whether a switch can control feature `id`: a room, or a stamp with both lit and unlit variants. */
    private switchable(id: string): boolean {
        const feature = this.getFeature(id);
        if (feature?.type === 'room') {
            return true;
        }
        const lamp = feature?.type === 'stamp' ? this.catalog.get(feature.stamp) : null;
        return lamp !== null && lampVariant(lamp, true) !== null && lampVariant(lamp, false) !== null;
    }

    /**
     * Record a room door's state changed in play, without touching its walls
     * (the live wall already shows it). A later re-sync then keeps the door as
     * it was left rather than resetting it.
     */
    private async recordRoomDoorState(room: RoomFeature, wallId: string, state: DoorState): Promise<boolean> {
        const plan = planDocuments(room, this.planContext());
        const segment = plan.walls[room.docs.walls.indexOf(wallId)]?.segment;
        const door = segment === undefined ? null : doorOn(room, segment);
        if (segment === undefined || !door || door.state === state) {
            return false;
        }
        const { segment: _segment, ...settings } = door;
        const next = withRoomDoor(room, segment, { ...settings, state });
        this.features = this.features.map((f) => (f.id === room.id ? next : f));
        await this.store.save(this.features);
        return true;
    }

    /** Switch a placed stamp to variant `index` (clamped); false if it is not a stamp or its pack is gone. */
    async setStampVariant(id: string, index: number): Promise<boolean> {
        const feature = this.getFeature(id);
        const stamp = feature?.type === 'stamp' ? this.catalog.get(feature.stamp) : null;
        if (feature?.type !== 'stamp' || !stamp) {
            return false;
        }
        const varied = await this.withSilhouette(withStampVariant(feature, stamp, index, this.stampGrid(stamp)));
        await this.replaceFeature(id, await this.followPile(varied, feature.pile));
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
        await this.transaction(async () => {
            this.snapshot();
            const before = [...this.features];
            this.features.push(feature);
            this.show(feature);
            await this.store.save(this.features);
            await this.syncDocs(feature);
            await this.resyncDependents(before, [feature]);
        });
    }

    async remove(id: string): Promise<void> {
        const target = this.features.find((f) => f.id === id);
        if (!target) {
            return;
        }
        await this.transaction(async () => {
            this.snapshot();
            const before = this.features;
            // What goes is no longer anything's to switch.
            const unlinked: SwitchTarget = { kind: 'feature', id };
            this.features = this.features
                .filter((f) => f.id !== id)
                .map((f) => {
                    const lightSwitch = switchOf(f);
                    return lightSwitch ? { ...lightSwitch, switchTargets: lightSwitch.switchTargets.filter((t) => !sameTarget(t, unlinked)) } : f;
                });
            this.renderer.remove(id);
            await this.store.save(this.features);
            await this.discard(target);
            await this.resyncDependents(before, [target]);
        });
    }

    /** Delete everything a feature owns outside the feature list: its documents, its interior exit, its container pile. */
    private async discard(feature: Feature): Promise<void> {
        if (hasDocs(feature.docs)) {
            await this.transaction(() => this.staged.stage({ remove: feature.docs, create: NO_PLAN, updateTiles: [], updateWalls: [] }));
        }
        if (feature.type !== 'stamp') {
            return;
        }
        // A linked stamp's exit lives in its interior scene; it goes with the stamp.
        if (feature.submap) {
            await this.scenes.deleteRegion(feature.submap.scene, feature.submap.exitRegion);
        }
        if (feature.pile !== null) {
            await this.containers.remove(feature.pile);
        }
    }

    /**
     * Rebuild what `discard` deleted for a feature undo or redo brings back:
     * a fresh container pile, and the interior exit under its fixed id. Its
     * documents were deleted, so it forgets their ids (the sync that follows
     * would otherwise update them in place) and that sync recreates them.
     */
    private async revive(revived: Feature): Promise<Feature> {
        const feature = withDocs(revived, NO_DOCS);
        if (feature.type !== 'stamp') {
            return feature;
        }
        const withPile = feature.pile === null ? feature : await this.withPile({ ...feature, pile: null }, this.catalog.get(feature.stamp)?.name ?? '');
        await this.restoreExit(withPile);
        return withPile;
    }

    /** Recreate a linked stamp's exit in its interior (its id is fixed by the link, so the entrance still points at it). */
    private async restoreExit(stamp: StampFeature): Promise<void> {
        const here = this.scenes.current();
        const frame = stamp.submap ? this.scenes.frame(stamp.submap.scene) : null;
        if (stamp.submap && here && frame) {
            await this.scenes.createRegion(stamp.submap.scene, exitRegion(stamp.submap, exitSquare(frame), here.id, here.name));
        }
    }

    /**
     * Make `target` (an undo or redo snapshot) the live feature list, and bring
     * the scene's documents with it:
     * - features it drops are discarded;
     * - features it brings back are revived and synced;
     * - features it changes are synced from their live documents (the snapshot's
     *   document ids were replaced since);
     * - an interior link it undoes or redoes moves the exit region to match.
     */
    private async restore(target: readonly Feature[]): Promise<void> {
        const live = new Map(this.features.map((f) => [f.id, f]));
        const kept = new Set(target.map((f) => f.id));
        const before = this.features;
        const dropped = before.filter((f) => !kept.has(f.id));
        await Promise.all(dropped.map(async (f) => this.discard(f)));

        const unchanged = (f: Feature, current: Feature): boolean => JSON.stringify({ ...f, docs: null }) === JSON.stringify({ ...current, docs: null });
        const touched = target.filter((f) => {
            const current = live.get(f.id);
            return !current || !unchanged(f, current);
        });
        // In order: reviving can create piles and exit regions, which must not race.
        this.features = await target.reduce(async (built, f) => {
            const list = await built;
            const current = live.get(f.id);
            if (!current) {
                return [...list, await this.revive(f)];
            }
            return [...list, unchanged(f, current) ? current : await this.relink(f, current)];
        }, Promise.resolve<Feature[]>([]));
        await this.store.save(this.features);
        this.redraw();
        await touched.reduce(async (previous, f) => {
            await previous;
            await this.syncDocs(this.getFeature(f.id) ?? f);
        }, Promise.resolve());
        await this.resyncDependents(before, [...dropped, ...touched]);
    }

    /** A changed feature restored from a snapshot, on the live documents, with its interior exit moved to match. */
    private async relink(restored: Feature, current: Feature): Promise<Feature> {
        const next = withDocs(restored, current.docs);
        if (next.type !== 'stamp' || current.type !== 'stamp') {
            return next;
        }
        if (JSON.stringify(next.submap) !== JSON.stringify(current.submap)) {
            if (current.submap) {
                await this.scenes.deleteRegion(current.submap.scene, current.submap.exitRegion);
            }
            await this.restoreExit(next);
        }
        // The live pile is the real one; the snapshot's may since have been removed.
        return this.followPile(next, current.pile);
    }

    /**
     * Keep a stamp's pile in line with its variant's container flag: create
     * the pile a variant now needs, and remove one it no longer has (a
     * smashed crate is not a container).
     */
    private async followPile(stamp: StampFeature, livePile: string | null): Promise<StampFeature> {
        if (stamp.behaviour.container && livePile === null) {
            return this.withPile({ ...stamp, pile: null }, stamp.name);
        }
        if (!stamp.behaviour.container && livePile !== null) {
            await this.containers.remove(livePile);
            return { ...stamp, pile: null };
        }
        return { ...stamp, pile: livePile };
    }

    /** The features shown on the active level, topmost (last drawn) first: what pointer picks consider. */
    private topDown(): Feature[] {
        return drawOrder(this.features.filter((f) => this.visible(f))).reverse();
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

    /** Toggle whether a room's perimeter segment is a door (a new door is ordinary and closed); re-syncs the native walls. */
    async toggleDoor(id: string, index: number): Promise<boolean> {
        const f = this.getFeature(id);
        if (f?.type !== 'room') {
            return false;
        }
        return this.setRoomDoor(id, index, doorOn(f, index) ? null : NEW_DOOR);
    }

    /** The door on a room's perimeter segment, or null. */
    roomDoor(id: string, index: number): RoomDoor | null {
        const f = this.getFeature(id);
        return f?.type === 'room' ? doorOn(f, index) : null;
    }

    /** Put a door with `settings` on a room's perimeter segment, or clear it with null; re-syncs the native walls. */
    /** A room's floor and wall materials, or null for anything else. */
    roomMaterials(id: string): RoomMaterials | null {
        const f = this.getFeature(id);
        return f?.type === 'room' ? roomMaterialsOf(f) : null;
    }

    /** Give a room other floor and wall materials; false if it is not a room. */
    async setRoomMaterials(id: string, materials: RoomMaterials): Promise<boolean> {
        const f = this.getFeature(id);
        if (f?.type !== 'room') {
            return false;
        }
        await this.replaceFeature(id, withRoomMaterials(f, materials));
        return true;
    }

    async setRoomDoor(id: string, index: number, settings: DoorSettings | null): Promise<boolean> {
        const f = this.getFeature(id);
        if (f?.type !== 'room' || index < 0 || index >= f.points.length) {
            return false;
        }
        await this.replaceFeature(id, withRoomDoor(f, index, settings));
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

    /** Set a path's half-width at one control point; false if it is not a path point. */
    async setPathWidth(id: string, index: number, halfWidth: number): Promise<boolean> {
        const f = this.getFeature(id);
        const next = f ? setHalfWidth(f, index, halfWidth) : null;
        if (!next) {
            return false;
        }
        await this.replaceFeature(id, next);
        return true;
    }

    /** Render a transient preview of a path width change (drag feedback), without persisting. */
    previewPathWidth(id: string, index: number, halfWidth: number): void {
        const f = this.getFeature(id);
        const next = f ? setHalfWidth(f, index, halfWidth) : null;
        if (next) {
            this.renderer.preview(next);
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

    /** Step back one edit, bringing the scene's generated documents (or a blend's mask) back with it. */
    async undo(): Promise<void> {
        const prev = this.history.pop();
        if (!prev) {
            return;
        }
        this.future.push(this.present(prev));
        await this.revert(prev);
    }

    /** Re-apply an undone edit, documents included. */
    async redo(): Promise<void> {
        const next = this.future.pop();
        if (!next) {
            return;
        }
        this.history.push(this.present(next));
        await this.revert(next);
    }

    /** The present state of what `entry` records, to step back to it again. */
    private present(entry: HistoryEntry): HistoryEntry {
        if (entry.kind === 'features') {
            return { kind: 'features', features: [...this.features] };
        }
        const now = this.splats.get(entry.key);
        return now ? { kind: 'blend', key: entry.key, layer: now.layer, mask: now.mask.slice() } : entry;
    }

    /** Make what `entry` records the present. */
    private async revert(entry: HistoryEntry): Promise<void> {
        if (entry.kind === 'features') {
            // One transaction: an undo lands whole or not at all.
            await this.transaction(async () => this.restore(entry.features));
            return;
        }
        this.splats.set(entry.key, { layer: entry.layer, mask: entry.mask.slice() });
        this.redrawSplats();
        await this.saveSplat(entry.key);
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
        await this.transaction(async () => {
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
        });
    }

    /**
     * Re-sync the features whose plan depends on others that just changed. A
     * door stamp changes the openings in room walls, and a room changes which
     * stretches its neighbours share with it (and their doors). Only rooms
     * whose planned walls actually differ are touched.
     */
    private async resyncDependents(before: readonly Feature[], changed: readonly Feature[]): Promise<void> {
        if (!changed.some((f) => isDoorStamp(f) || f.type === 'room')) {
            return;
        }
        const wallsOf = (room: Feature, features: readonly Feature[]): string => JSON.stringify(planDocuments(room, this.planContext(features)).walls);
        // The changed features themselves were synced already.
        const changedIds = new Set(changed.map((f) => f.id));
        const affected = this.features.filter((f) => f.type === 'room' && !changedIds.has(f.id) && wallsOf(f, before) !== wallsOf(f, this.features));
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
        await this.transaction(async () => this.stageDocs(feature));
    }

    private async stageDocs(feature: Feature): Promise<void> {
        const plan = planDocuments(feature, this.planContext());
        const old = feature.docs;
        const planned = plan.walls.length + plan.lights.length + plan.tiles.length + plan.regions.length + plan.sounds.length;
        if (planned === 0 && !hasDocs(old)) {
            return;
        }
        // Tiles and walls whose count is unchanged are updated in place, keeping their ids:
        // a door or switch a player just used must not be deleted from under them.
        const keepTiles = old.tiles.length > 0 && old.tiles.length === plan.tiles.length;
        const keepWalls = old.walls.length > 0 && old.walls.length === plan.walls.length;
        const created = this.staged.stage({
            remove: { ...old, tiles: keepTiles ? [] : old.tiles, walls: keepWalls ? [] : old.walls },
            create: { ...plan, tiles: keepTiles ? [] : plan.tiles, walls: keepWalls ? [] : plan.walls },
            updateTiles: keepTiles ? pairDocs(old.tiles, plan.tiles).map(({ id, doc }) => ({ id, tile: doc })) : [],
            updateWalls: keepWalls ? pairDocs(old.walls, plan.walls).map(({ id, doc }) => ({ id, wall: doc })) : [],
        });
        const docs: GeneratedDocs = {
            ...created,
            tiles: keepTiles ? old.tiles : created.tiles,
            walls: keepWalls ? old.walls : created.walls,
        };
        this.features = this.features.map((f) => (f.id === feature.id ? withDocs(f, docs) : f));
        await this.store.save(this.features);
    }

    /**
     * Run `work` as one document transaction: whatever it stages is written
     * together when it ends, atomically. Nested transactions join the
     * outermost, which does the writing. If the work or the write fails,
     * nothing was written, so the feature list and undo history roll back to
     * where the transaction began (and are persisted so), and the error
     * propagates. Side effects outside the scene's documents (another scene's
     * exit region, a container pile, a level) are not rolled back.
     */
    private async transaction<T>(work: () => Promise<T> | T): Promise<T> {
        if (this.writing > 0) {
            return work();
        }
        const before = { features: [...this.features], history: [...this.history], future: [...this.future] };
        this.writing = 1;
        try {
            const result = await work();
            if (!this.staged.empty) {
                await this.sink.write(this.staged.take());
            }
            return result;
        } catch (error) {
            this.staged.take();
            this.features = before.features;
            this.history.splice(0, this.history.length, ...before.history);
            this.future = before.future;
            this.redraw();
            await this.store.save(this.features);
            throw error;
        } finally {
            this.writing = 0;
        }
    }

    /** A fresh id for a feature built outside the controller (e.g. from a scene spec). */
    newFeatureId(): string {
        return this.makeId();
    }

    /** Run `work` as one edit: a single undo step takes back everything it did. */
    async batch(work: () => Promise<void>): Promise<void> {
        if (this.batching) {
            await work();
            return;
        }
        this.snapshot();
        this.batching = true;
        try {
            // One undo step, and one atomic document write.
            await this.transaction(work);
        } finally {
            this.batching = false;
        }
    }

    /** Record the current feature list for undo, capped, and drop the redo stack; inside a batch, the batch's one snapshot stands. */
    private snapshot(): void {
        if (this.batching) {
            return;
        }
        this.record({ kind: 'features', features: [...this.features] });
    }

    /** Push an undo step, capped, and drop the redo stack. */
    private record(entry: HistoryEntry): void {
        this.history.push(entry);
        if (this.history.length > MAX_HISTORY) {
            this.history.shift();
        }
        this.future = [];
    }

    /** Read every level's splat map in from the scene; a mask that cannot be read starts blank. */
    async loadSplats(): Promise<void> {
        const layers = this.splatStore.load();
        const loaded = await Promise.all(layers.map(async (layer) => ({ layer, mask: (await this.splatStore.readMask(layer)) ?? blankMask(layer) })));
        this.splats.clear();
        for (const splat of loaded) {
            this.splats.set(splatKey(splat.layer.level), splat);
        }
        this.redrawSplats();
    }

    /** The splat map of the level being edited, if it has one. */
    splatLayer(): SplatLayer | null {
        return this.splats.get(splatKey(this.active))?.layer ?? null;
    }

    /**
     * One dab of the blend brush on the level being edited: its splat map,
     * made to cover the scene if it has none yet, takes the role into a
     * channel of its own (false once all four hold other roles, or with no
     * scene to cover). The stroke ends, as one undo step, with `endBlend`.
     */
    blend(dab: BlendDab): boolean {
        const key = splatKey(this.active);
        const splat = this.splats.get(key) ?? this.newSplat();
        const assigned = splat && channelFor(splat.layer, dab.role);
        if (!splat || !assigned) {
            return false;
        }
        this.blendStart ??= { key, layer: splat.layer, mask: splat.mask.slice() };
        const rect = paintDab(splat.mask, assigned.layer, {
            at: maskPoint(assigned.layer, dab.at),
            radius: maskLength(assigned.layer, dab.radius),
            channel: assigned.channel,
            strength: dab.strength,
            erase: dab.erase,
        });
        if (assigned.layer === this.splats.get(key)?.layer) {
            this.splatRenderer.update(key, rect);
        } else {
            this.splats.set(key, { layer: assigned.layer, mask: splat.mask });
            this.splatRenderer.set(key, assigned.layer, splat.mask);
        }
        return true;
    }

    /** End the blend stroke under way: one undo step, and its mask saved. */
    async endBlend(): Promise<void> {
        const start = this.blendStart;
        if (!start) {
            return;
        }
        this.blendStart = null;
        this.record({ kind: 'blend', ...start });
        await this.saveSplat(start.key);
    }

    /** A blank splat map over the scene for the level being edited, or null with no scene frame to cover. */
    private newSplat(): Splat | null {
        const here = this.scenes.current();
        const frame = here ? this.scenes.frame(here.id) : null;
        if (!frame) {
            return null;
        }
        const layer = newSplatLayer(this.active, this.splatStore.pathFor(this.active), frame, frame.gridSize);
        return { layer, mask: blankMask(layer) };
    }

    /** Draw the splat maps shown while editing the active level, and no others. */
    private redrawSplats(): void {
        for (const [key, splat] of this.splats) {
            if (onLevel(splat.layer.level, this.active)) {
                this.splatRenderer.set(key, splat.layer, splat.mask);
            } else {
                this.splatRenderer.remove(key);
            }
        }
    }

    /** Save one splat map's mask, and every layer's record. */
    private async saveSplat(key: string): Promise<void> {
        const splat = this.splats.get(key);
        if (splat) {
            await this.splatStore.writeMask(splat.layer, splat.mask);
        }
        await this.splatStore.save([...this.splats.values()].map((s) => s.layer));
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
            return makePath(id, this.brush.kind, pts, this.halfWidth, this.pathWalls, this.riverLook);
        }
        if (this.brush.type === 'region') {
            const region = makeRegion(id, this.brush.biome, pts);
            return region && { ...region, movementCost: storedCost(this.movementCost) };
        }
        if (this.brush.type === 'room') {
            return makeRoom(id, this.brush.floor, pts, this.brush.wall ?? null, this.brush.wallKind, this.brush.ceiling);
        }
        const stroke = makeStroke(id, this.brush.biome, pts, this.brushRadius);
        return stroke && { ...stroke, movementCost: storedCost(this.movementCost) };
    }

    private redraw(): void {
        this.renderer.clear();
        for (const f of drawOrder(this.features)) {
            if (this.visible(f)) {
                this.renderer.set(f.id, f);
            }
        }
        this.redrawSplats();
    }
}
