// SPDX-License-Identifier: AGPL-3.0-or-later
/** Stories for the zone panel; each keeps its own zone, so the controls work in Storybook. */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { NEW_ZONE, type ZoneSettings, type ZoneShapeKind } from '../tools/zone';
import { renderZonePanel, type TokenChoice, type ZoneLabels } from './zone-panel-view';

export interface ZonePanelArgs {
    readonly settings: ZoneSettings;
    readonly tokens: readonly TokenChoice[];
}

const SHAPE_NAMES: Readonly<Record<ZoneShapeKind, string>> = {
    circle: 'Circle',
    ellipse: 'Ellipse',
    ring: 'Ring',
    cone: 'Cone',
    line: 'Line',
    rectangle: 'Rectangle',
};

/** Foundry's field names for each shape's sizes, where they differ from the plain name. */
const SIZE_NAMES: Readonly<Record<string, string>> = {
    'radius': 'Radius',
    'radiusX': 'X-Radius',
    'radiusY': 'Y-Radius',
    'innerWidth': 'Inner Width',
    'outerWidth': 'Outer Width',
    'angle': 'Angle',
    'length': 'Length',
    'width': 'Width',
    'rectangle.width': 'X-Size',
    'rectangle.height': 'Y-Size',
};

/** Named as Foundry's own shape and Region sheet strings name them. */
const LABELS: ZoneLabels = {
    name: 'Name',
    shape: 'Type',
    shapes: SHAPE_NAMES,
    size: (kind, field) => SIZE_NAMES[`${kind}.${field}`] ?? SIZE_NAMES[field] ?? field,
    curvature: 'Curvature',
    curvatures: { round: 'Round', flat: 'Flat', semicircle: 'Semicircle' },
    rotation: 'Rotation',
    gridBased: 'Is Grid-Based',
    token: 'Attached Token',
    none: 'None',
};

const TOKENS: readonly TokenChoice[] = [
    { id: 'tokenAcolyte0001', name: 'Sister Ibnad' },
    { id: 'tokenServitor001', name: 'Gun-servitor' },
];

/** Mount an interactive panel inside a stand-in Foundry window scoped for the module's styles. */
export function mountZonePanel(args: ZonePanelArgs): HTMLElement {
    const windowEl = document.createElement('div');
    windowEl.className = 'zephyrex-cartography zc-story-window';
    const root = document.createElement('div');
    windowEl.append(root);
    let settings = args.settings;
    const render = (): void => {
        renderZonePanel(root, { settings, tokens: args.tokens }, LABELS, {
            set: (next) => {
                settings = next;
                render();
                return true;
            },
        });
    };
    render();
    return windowEl;
}

const meta: Meta<ZonePanelArgs> = {
    title: 'Regions/Zone Panel',
    excludeStories: ['mountZonePanel'],
    render: mountZonePanel,
    args: { settings: NEW_ZONE, tokens: TOKENS },
};

export default meta;

type Story = StoryObj<ZonePanelArgs>;

export const NewZone: Story = {};

/** A flamer's cone, following the servitor that carries it. */
export const FlamerCone: Story = {
    args: {
        settings: {
            name: 'Promethium wash',
            shape: { kind: 'cone', radius: 300, angle: 60, curvature: 'flat' },
            rotation: 45,
            gridBased: true,
            attachedTo: 'tokenServitor001',
        },
    },
};

export const Ring: Story = {
    args: { settings: { ...NEW_ZONE, name: 'Cordon', shape: { kind: 'ring', radius: 400, innerWidth: 50, outerWidth: 50 } } },
};
