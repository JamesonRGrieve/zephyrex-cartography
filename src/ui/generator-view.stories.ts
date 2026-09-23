// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Stories for the map builder panel. Each runs the real form rules and spec
 * parser, and "builds" by reporting what it would build, so the panel is
 * fully interactive in Storybook.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { generateFloorPlan } from '../generate/floor-plan';
import { DEFAULT_GENERATOR_FORM, floorPlanOptions, newSeed, withGeneratorField, type GeneratorForm } from '../generate/form';
import { formatSpecIssue, parseSceneSpecJson } from '../generate/spec';
import { renderGeneratorPanel, type GeneratorLabels, type GeneratorPanel } from './generator-view';

export type GeneratorArgs = GeneratorPanel;

const LABELS: GeneratorLabels = {
    floorPlan: 'Floor plan',
    seed: 'Seed',
    newSeed: 'New seed',
    width: 'Width',
    height: 'Height',
    minRoom: 'Smallest room',
    maxRoom: 'Largest room',
    entrance: 'Entrance',
    generate: 'Generate',
    spec: 'Scene spec (JSON)',
    buildSpec: 'Build spec',
};

/** What a build would make, as the status line reports it. */
function describeBuild(featureCount: number): string {
    return `Would build ${featureCount} features.`;
}

/** Mount an interactive panel inside a stand-in Foundry window scoped for the module's styles. */
export function mountGeneratorPanel(args: GeneratorArgs): HTMLElement {
    const windowEl = document.createElement('div');
    windowEl.className = 'zephyrex-cartography zc-story-window';
    const root = document.createElement('div');
    windowEl.append(root);
    let panel: GeneratorPanel = args;
    let seeds = 0;
    const render = (): void => {
        renderGeneratorPanel(root, panel, LABELS, {
            setField: (field, typed) => {
                const form = withGeneratorField(panel.form, field, typed);
                if (form) {
                    panel = { ...panel, form };
                    render();
                }
                return form !== null;
            },
            setEntrance: (entrance) => {
                panel = { ...panel, form: { ...panel.form, entrance } };
                render();
            },
            newSeed: () => {
                seeds += 1;
                panel = { ...panel, form: { ...panel.form, seed: newSeed(() => (seeds * 0.618) % 1) } };
                render();
            },
            generate: () => {
                const spec = generateFloorPlan(floorPlanOptions(panel.form, { floor: 'dirt', wall: null }));
                panel = { ...panel, status: [describeBuild(spec.features.length)] };
                render();
            },
            setSpecText: (specText) => {
                panel = { ...panel, specText };
            },
            buildSpec: () => {
                const result = parseSceneSpecJson(panel.specText);
                panel = { ...panel, status: result.ok ? [describeBuild(result.spec.features.length)] : result.issues.map(formatSpecIssue) };
                render();
            },
        });
    };
    render();
    return windowEl;
}

const FORM: GeneratorForm = DEFAULT_GENERATOR_FORM;

const SPEC = JSON.stringify({
    schemaVersion: 1,
    features: [
        {
            type: 'room',
            points: [
                { x: 0, y: 0 },
                { x: 4, y: 0 },
                { x: 4, y: 3 },
                { x: 0, y: 3 },
            ],
            doors: [{ segment: 1 }],
        },
    ],
});

const meta: Meta<GeneratorArgs> = {
    title: 'Builder/Generator Panel',
    excludeStories: ['mountGeneratorPanel'],
    render: mountGeneratorPanel,
    args: { form: FORM, specText: '', status: null, busy: false },
};

export default meta;

type Story = StoryObj<GeneratorArgs>;

export const Empty: Story = {};

export const WithSpec: Story = {
    args: { specText: SPEC },
};

export const Built: Story = {
    args: { status: ['Built 9 features.'] },
};

export const RefusedSpec: Story = {
    args: {
        specText: '{"schemaVersion": 1, "features": [{"type": "region"}]}',
        status: ['features.0.biome: Invalid option', 'features.0.points: Invalid input'],
    },
};

export const Building: Story = {
    args: { busy: true },
};
