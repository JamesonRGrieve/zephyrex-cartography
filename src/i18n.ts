// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Every localisation key the module uses, in one place. `i18n.test.ts` asserts
 * this set and `static/lang/en.json` match exactly (no missing, no unused keys),
 * so a typo or a stale entry fails the gate instead of showing a raw key in
 * Foundry.
 */
import type { BiomeKind } from './tools/biome';

/** Root namespace of every key (the top-level object in `static/lang/en.json`). */
export const I18N_ROOT = 'ZEPHYREX-CARTOGRAPHY';

function key(path: string): string {
    return `${I18N_ROOT}.${path}`;
}

export const I18N = {
    controlsGroup: key('Controls.Group'),
    tools: {
        road: key('Tools.Road'),
        river: key('Tools.River'),
        room: key('Tools.Room'),
        door: key('Tools.Door'),
        edit: key('Tools.Edit'),
        erase: key('Tools.Erase'),
        undo: key('Tools.Undo'),
        redo: key('Tools.Redo'),
        stamp: key('Tools.Stamp'),
        levels: key('Tools.Levels'),
        materials: key('Tools.Materials'),
        generator: key('Tools.Generator'),
    },
    generator: {
        title: key('Generator.Title'),
        floorPlan: key('Generator.FloorPlan'),
        seed: key('Generator.Seed'),
        newSeed: key('Generator.NewSeed'),
        width: key('Generator.Width'),
        height: key('Generator.Height'),
        minRoom: key('Generator.MinRoom'),
        maxRoom: key('Generator.MaxRoom'),
        entrance: key('Generator.Entrance'),
        generate: key('Generator.Generate'),
        spec: key('Generator.Spec'),
        buildSpec: key('Generator.BuildSpec'),
        built: key('Generator.Built'),
        refused: key('Generator.Refused'),
        problems: { level: key('Generator.Problems.Level'), stamp: key('Generator.Problems.Stamp'), interior: key('Generator.Problems.Interior') },
    },
    levels: {
        title: key('Levels.Title'),
        allLevels: key('Levels.AllLevels'),
        addAbove: key('Levels.AddAbove'),
        addBelow: key('Levels.AddBelow'),
        remove: key('Levels.Remove'),
        name: key('Levels.Name'),
        bottom: key('Levels.Bottom'),
        top: key('Levels.Top'),
        features: key('Levels.Features'),
        newLevel: key('Levels.NewLevel'),
        empty: key('Levels.Empty'),
        removeBlocked: key('Levels.RemoveBlocked'),
        list: key('Levels.List'),
    },
    materials: {
        title: key('Materials.Title'),
        floor: key('Materials.Floor'),
        wall: key('Materials.Wall'),
        noWall: key('Materials.NoWall'),
    },
    doors: {
        title: key('Doors.Title'),
        type: key('Doors.Type'),
        state: key('Doors.State'),
        remove: key('Doors.Remove'),
        types: { door: key('Doors.Types.Door'), secret: key('Doors.Types.Secret') },
        states: { closed: key('Doors.States.Closed'), open: key('Doors.States.Open'), locked: key('Doors.States.Locked') },
    },
    regions: {
        transition: key('Regions.Transition'),
        entrance: key('Regions.Entrance'),
        exit: key('Regions.Exit'),
    },
    submap: {
        title: key('Submap.Title'),
        linkedTo: key('Submap.LinkedTo'),
        notLinked: key('Submap.NotLinked'),
        createInterior: key('Submap.CreateInterior'),
        linkExisting: key('Submap.LinkExisting'),
        scene: key('Submap.Scene'),
        link: key('Submap.Link'),
        open: key('Submap.Open'),
        unlink: key('Submap.Unlink'),
        noScenes: key('Submap.NoScenes'),
        hud: key('Submap.Hud'),
        defaultName: key('Submap.DefaultName'),
    },
    settings: {
        textureSetName: key('Settings.TextureSet.Name'),
        textureSetHint: key('Settings.TextureSet.Hint'),
        stampSnapName: key('Settings.StampSnap.Name'),
        stampSnapHint: key('Settings.StampSnap.Hint'),
        stampScaleName: key('Settings.StampScale.Name'),
        stampScaleHint: key('Settings.StampScale.Hint'),
        terrainRegionsName: key('Settings.TerrainRegions.Name'),
        terrainRegionsHint: key('Settings.TerrainRegions.Hint'),
    },
    browser: {
        title: key('Browser.Title'),
        search: key('Browser.Search'),
        scale: key('Browser.Scale'),
        perspective: key('Browser.Perspective'),
        any: key('Browser.Any'),
        all: key('Browser.All'),
        rotate: key('Browser.Rotate'),
        clearTags: key('Browser.ClearTags'),
        place: key('Browser.Place'),
        variants: key('Browser.Variants'),
        empty: key('Browser.Empty'),
        noSelection: key('Browser.NoSelection'),
        categories: key('Browser.Categories'),
        stamps: key('Browser.Stamps'),
        status: key('Browser.Status'),
        cardHint: key('Browser.CardHint'),
    },
    hud: {
        variant: key('Hud.Variant'),
    },
    notifications: {
        packInvalid: key('Notifications.PackInvalid'),
        packFetchFailed: key('Notifications.PackFetchFailed'),
        noScene: key('Notifications.NoScene'),
        noArmedStamp: key('Notifications.NoArmedStamp'),
    },
} as const;

/** Region-name key per transition kind. */
export const TRANSITION_KIND_KEYS: Record<'stairs' | 'ladder' | 'lift' | 'hatch', string> = {
    stairs: key('Regions.Kinds.Stairs'),
    ladder: key('Regions.Kinds.Ladder'),
    lift: key('Regions.Kinds.Lift'),
    hatch: key('Regions.Kinds.Hatch'),
};

/** Scene-control title key per biome tool. */
export const BIOME_TITLE_KEYS: Record<BiomeKind, string> = {
    water: key('Biomes.Water'),
    grassland: key('Biomes.Grassland'),
    forest: key('Biomes.Forest'),
    sand: key('Biomes.Sand'),
    rock: key('Biomes.Rock'),
    snow: key('Biomes.Snow'),
    dirt: key('Biomes.Dirt'),
    lava: key('Biomes.Lava'),
    marsh: key('Biomes.Marsh'),
    ice: key('Biomes.Ice'),
    ash: key('Biomes.Ash'),
    tundra: key('Biomes.Tundra'),
    ocean: key('Biomes.Ocean'),
};
