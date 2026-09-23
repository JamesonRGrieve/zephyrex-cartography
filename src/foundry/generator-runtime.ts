// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The map builder window. It generates a floor plan, or takes any scene spec
 * as JSON, and realises it on the current scene from the scene's top-left
 * corner. A generated plan's spec is put in the spec box, so the GM can edit
 * it and build it again. Rooms get the materials last chosen in the
 * materials panel.
 */
import type { CartographyController } from '../canvas/controller';
import type { RealizeReport } from '../canvas/realize';
import { generateFloorPlan } from '../generate/floor-plan';
import { DEFAULT_GENERATOR_FORM, floorPlanOptions, newSeed, withGeneratorField, type GeneratorForm } from '../generate/form';
import { formatSpecIssue, parseSceneSpecJson, type SceneSpec } from '../generate/spec';
import { I18N } from '../i18n';
import type { RoomMaterials } from '../tools/room';
import { renderGeneratorPanel, type GeneratorLabels, type GeneratorPanel } from '../ui/generator-view';
import { buildOnScene } from './build-spec';
import { format, localize } from './localize';
import { createViewWindow } from './view-window';

const PANEL_WIDTH = 520;
const PANEL_HEIGHT = 460;

/** Spaces per indent level of a generated spec shown for editing. */
const SPEC_INDENT = 2;

function panelLabels(): GeneratorLabels {
    const g = I18N.generator;
    return {
        floorPlan: localize(g.floorPlan),
        seed: localize(g.seed),
        newSeed: localize(g.newSeed),
        width: localize(g.width),
        height: localize(g.height),
        minRoom: localize(g.minRoom),
        maxRoom: localize(g.maxRoom),
        entrance: localize(g.entrance),
        generate: localize(g.generate),
        spec: localize(g.spec),
        buildSpec: localize(g.buildSpec),
    };
}

function reportLines(report: RealizeReport): string[] {
    const problems = I18N.generator.problems;
    return [
        format(I18N.generator.built, { count: String(report.features.length) }),
        ...report.problems.map((p) => format(problems[p.problem], { index: String(p.index) })),
    ];
}

export interface GeneratorRuntime {
    readonly open: () => void;
}

export function registerGeneratorRuntime(controller: () => CartographyController | null, roomMaterials: () => RoomMaterials): GeneratorRuntime {
    let form: GeneratorForm = DEFAULT_GENERATOR_FORM;
    let specText = '';
    let outcome: readonly string[] | null = null;
    let busy = false;

    const build = async (active: CartographyController, spec: SceneSpec): Promise<void> => {
        busy = true;
        panelWindow.refresh();
        try {
            outcome = reportLines(await buildOnScene(active, spec));
        } finally {
            busy = false;
            panelWindow.refresh();
        }
    };

    const panelWindow = createViewWindow({
        id: 'generator',
        title: () => localize(I18N.generator.title),
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
        render: (root) => {
            const panel: GeneratorPanel = { form, specText, status: outcome, busy };
            renderGeneratorPanel(root, panel, panelLabels(), {
                setField: (field, typed) => {
                    const next = withGeneratorField(form, field, typed);
                    if (next) {
                        form = next;
                    }
                    return next !== null;
                },
                setEntrance: (entrance) => {
                    form = { ...form, entrance };
                },
                newSeed: () => {
                    form = { ...form, seed: newSeed(Math.random) };
                    panelWindow.refresh();
                },
                generate: () => {
                    const active = controller();
                    if (!active || busy) {
                        return;
                    }
                    const spec = generateFloorPlan(floorPlanOptions(form, roomMaterials()));
                    specText = JSON.stringify(spec, null, SPEC_INDENT);
                    void build(active, spec);
                },
                setSpecText: (text) => {
                    specText = text;
                },
                buildSpec: () => {
                    const active = controller();
                    if (!active || busy) {
                        return;
                    }
                    const parsed = parseSceneSpecJson(specText);
                    if (parsed.ok) {
                        void build(active, parsed.spec);
                    } else {
                        outcome = [localize(I18N.generator.refused), ...parsed.issues.map(formatSpecIssue)];
                        panelWindow.refresh();
                    }
                },
            });
        },
    });

    return {
        open: () => {
            panelWindow.open();
        },
    };
}
