// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Document changes staged for one atomic write. Every created document gets
 * its id here, up front, so a feature records its documents' ids before they
 * exist and a whole edit (or undo, or generated map) can go to Foundry as a
 * single transaction, where no operation may use another's result.
 *
 * Removing a document created earlier in the same transaction cancels its
 * create rather than queueing a delete of something that does not exist yet
 * (a room re-synced by a neighbour added after it, in one spec). Updating
 * such a tile updates its pending create instead. Pure and unit-tested; the
 * Foundry sink turns what it takes into create, update and delete operations.
 */
import type { GeneratedDocs, LightDoc, RegionDoc, SoundDoc, TileDoc, WallDoc } from '../tools/documents';
import { NO_DOCS } from '../tools/documents';
import type { DocumentPlan } from '../tools/plan';

/** One feature's change: its old documents to remove, the new ones to create, and tiles updated in place. */
export interface DocumentChange {
    readonly remove: GeneratedDocs;
    readonly create: DocumentPlan;
    readonly updateTiles: readonly { readonly id: string; readonly tile: TileDoc }[];
}

/** A document to create, with the id it will have. */
export interface Staged<T> {
    readonly id: string;
    readonly doc: T;
}

/**
 * Regions are staged per change, because a region's teleport names others of
 * the same change by position (`{plan: i}`); `ids[i]` is region `i`'s id. A
 * cancelled region keeps its position, so the others still resolve, and is
 * simply not created.
 */
export interface StagedRegions {
    readonly ids: readonly string[];
    readonly regions: readonly RegionDoc[];
    readonly cancelled: readonly string[];
}

/**
 * Everything staged, ready to write: deletes first, then creates, then
 * updates. A written region replaced under its own fixed id (a submap
 * entrance following its stamp) is an update: Foundry rejects a batch that
 * deletes and recreates one id. Its behaviours stay as they are, since a
 * fixed-id region's teleport target is fixed with its id.
 */
export interface StagedWrite {
    readonly deletes: GeneratedDocs;
    readonly walls: readonly Staged<WallDoc>[];
    readonly lights: readonly Staged<LightDoc>[];
    readonly tiles: readonly Staged<TileDoc>[];
    readonly sounds: readonly Staged<SoundDoc>[];
    readonly regions: readonly StagedRegions[];
    readonly tileUpdates: readonly Staged<TileDoc>[];
    readonly regionUpdates: readonly Staged<RegionDoc>[];
}

/** A kind of generated document. */
export type DocumentKind = keyof GeneratedDocs;

type Kind = DocumentKind;

const KINDS: readonly Kind[] = ['walls', 'lights', 'tiles', 'regions', 'sounds'];

export class StagedChanges {
    private deletes: Record<Kind, string[]> = emptyIds();
    private walls: Staged<WallDoc>[] = [];
    private lights: Staged<LightDoc>[] = [];
    private tiles: Staged<TileDoc>[] = [];
    private sounds: Staged<SoundDoc>[] = [];
    private regions: StagedRegions[] = [];
    private tileUpdates: Staged<TileDoc>[] = [];
    private regionUpdates: Staged<RegionDoc>[] = [];

    constructor(private readonly makeId: (kind: DocumentKind) => string) {}

    /** Whether anything is waiting to be written. */
    get empty(): boolean {
        return (
            KINDS.every((kind) => this.deletes[kind].length === 0) &&
            this.walls.length +
                this.lights.length +
                this.tiles.length +
                this.sounds.length +
                this.regions.length +
                this.tileUpdates.length +
                this.regionUpdates.length ===
                0
        );
    }

    /** Stage a change; returns the ids its created documents will have, by type, in input order. */
    stage(change: DocumentChange): GeneratedDocs {
        for (const kind of KINDS) {
            for (const id of change.remove[kind]) {
                this.remove(kind, id);
            }
        }
        for (const update of change.updateTiles) {
            this.updateTile(update.id, update.tile);
        }
        const walls = this.push('walls', this.walls, change.create.walls);
        const lights = this.push('lights', this.lights, change.create.lights);
        const tiles = this.push('tiles', this.tiles, change.create.tiles);
        const sounds = this.push('sounds', this.sounds, change.create.sounds);
        const regionIds = change.create.regions.map((region) => region.id ?? this.makeId('regions'));
        // A written region recreated under its own id is updated in place; it keeps its position in the group.
        const replaced = regionIds.filter((id, i) => change.create.regions[i]?.id === id && this.deletes.regions.includes(id));
        this.deletes.regions = this.deletes.regions.filter((id) => !replaced.includes(id));
        change.create.regions.forEach((region, i) => {
            const id = regionIds[i];
            if (id !== undefined && replaced.includes(id)) {
                this.regionUpdates = [...this.regionUpdates.filter((update) => update.id !== id), { id, doc: region }];
            }
        });
        if (regionIds.length > replaced.length) {
            this.regions.push({ ids: regionIds, regions: change.create.regions, cancelled: replaced });
        }
        return { ...NO_DOCS, walls, lights, tiles, sounds, regions: regionIds };
    }

    /** Hand over everything staged, and start afresh. */
    take(): StagedWrite {
        const write: StagedWrite = {
            deletes: { ...this.deletes },
            walls: this.walls,
            lights: this.lights,
            tiles: this.tiles,
            sounds: this.sounds,
            regions: this.regions,
            tileUpdates: this.tileUpdates,
            regionUpdates: this.regionUpdates,
        };
        this.deletes = emptyIds();
        this.walls = [];
        this.lights = [];
        this.tiles = [];
        this.sounds = [];
        this.regions = [];
        this.tileUpdates = [];
        this.regionUpdates = [];
        return write;
    }

    private push<T>(kind: Kind, into: Staged<T>[], docs: readonly T[]): string[] {
        return docs.map((doc) => {
            const id = this.makeId(kind);
            into.push({ id, doc });
            return id;
        });
    }

    /** Remove a document: cancel its create if it is still pending, otherwise queue its delete. */
    private remove(kind: Kind, id: string): void {
        // Deletes run before updates, and updating a deleted document would fail the whole batch.
        if (kind === 'tiles') {
            this.tileUpdates = this.tileUpdates.filter((update) => update.id !== id);
        }
        if (kind === 'regions') {
            this.regionUpdates = this.regionUpdates.filter((update) => update.id !== id);
            const group = this.regions.findIndex((staged) => staged.ids.includes(id) && !staged.cancelled.includes(id));
            const found = this.regions[group];
            if (found) {
                const cancelled = [...found.cancelled, id];
                // A group whose every region is cancelled has nothing left to create.
                this.regions =
                    cancelled.length === found.ids.length
                        ? this.regions.filter((_, i) => i !== group)
                        : this.regions.map((staged, i) => (i === group ? { ...staged, cancelled } : staged));
                return;
            }
        } else {
            const pending = this.pendingOf(kind);
            const at = pending.findIndex((staged) => staged.id === id);
            if (at >= 0) {
                pending.splice(at, 1);
                return;
            }
        }
        this.deletes[kind].push(id);
    }

    /** Update a tile in place: its pending create when it has not been written yet, otherwise the live tile. */
    private updateTile(id: string, tile: TileDoc): void {
        const pending = this.tiles.findIndex((staged) => staged.id === id);
        if (pending >= 0) {
            this.tiles[pending] = { id, doc: tile };
            return;
        }
        this.tileUpdates = [...this.tileUpdates.filter((update) => update.id !== id), { id, doc: tile }];
    }

    private pendingOf(kind: Exclude<Kind, 'regions'>): Staged<WallDoc | LightDoc | TileDoc | SoundDoc>[] {
        const pending: Record<Exclude<Kind, 'regions'>, Staged<WallDoc | LightDoc | TileDoc | SoundDoc>[]> = {
            walls: this.walls,
            lights: this.lights,
            tiles: this.tiles,
            sounds: this.sounds,
        };
        return pending[kind];
    }
}

function emptyIds(): Record<Kind, string[]> {
    return { walls: [], lights: [], tiles: [], regions: [], sounds: [] };
}
