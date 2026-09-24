// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Stamp particles on the canvas: Foundry's native `ParticleGenerator`, in
 * effect mode, one per emitter a stamp declares. Particles live on each
 * client, not in the scene's documents, so they ride along with the feature
 * renderer: when a stamp is drawn its emitters start, when it changes they
 * restart, and when it goes they stop. Only emitters on the viewed level run
 * (viewing another level redraws the canvas, and this with it).
 */
import type { FeatureRenderer } from '../canvas/renderer';
import type { Feature } from '../tools/feature';
import type { Level } from '../tools/levels';
import { emitterShown, stampEmitters, type EmitterSpec, type ParticleRange } from '../tools/particles';

type ParticleGenerator = foundry.canvas.animation.ParticleGenerator;

/** What the emitters need from the scene: its levels, and its distance units per grid square. */
export interface ParticleContext {
    readonly levels: readonly Level[];
    readonly gridDistance: number;
}

const PARTICLE_BLENDS: Readonly<Record<EmitterSpec['blend'], PIXI.BLEND_MODES>> = {
    normal: PIXI.BLEND_MODES.NORMAL,
    add: PIXI.BLEND_MODES.ADD,
    multiply: PIXI.BLEND_MODES.MULTIPLY,
    screen: PIXI.BLEND_MODES.SCREEN,
};

function range(value: ParticleRange): number | number[] {
    return typeof value === 'number' ? value : [...value];
}

function startGenerator(spec: EmitterSpec): ParticleGenerator {
    const generator = new foundry.canvas.animation.ParticleGenerator({
        mode: 'effect',
        // Effect mode spawns only on request by default; a stamp's emitter keeps its count alive on its own.
        manual: false,
        area: spec.area,
        count: spec.count,
        lifetime: range(spec.lifetime),
        velocity: spec.velocity && { speed: range(spec.velocity.speed), angle: range(spec.velocity.angle) },
        alpha: range(spec.alpha),
        scale: range(spec.scale),
        rotationSpeed: range(spec.rotationSpeed),
        fade: spec.fade,
        blend: PARTICLE_BLENDS[spec.blend],
        textures: [...spec.textures],
        elevation: spec.elevation,
    });
    generator.start();
    return generator;
}

interface Running {
    /** The emitters as last started, to tell a real change from a redraw. */
    readonly signature: string;
    readonly generators: readonly ParticleGenerator[];
}

/** `base`, plus each drawn stamp's particles. */
export function withParticles(base: FeatureRenderer, viewedLevel: string | null, context: () => ParticleContext | null): FeatureRenderer {
    const running = new Map<string, Running>();

    const halt = (id: string): void => {
        for (const generator of running.get(id)?.generators ?? []) {
            generator.stop({ hard: true });
        }
        running.delete(id);
    };

    const emit = (id: string, feature: Feature): void => {
        const scene = context();
        const specs =
            feature.type === 'stamp' && scene ? stampEmitters(feature, scene.levels, scene.gridDistance).filter((spec) => emitterShown(spec, viewedLevel)) : [];
        const signature = JSON.stringify(specs);
        if (running.get(id)?.signature === signature) {
            return;
        }
        halt(id);
        if (specs.length > 0) {
            running.set(id, { signature, generators: specs.map(startGenerator) });
        }
    };

    return {
        set: (id, feature) => {
            base.set(id, feature);
            emit(id, feature);
        },
        preview: base.preview,
        remove: (id) => {
            base.remove(id);
            halt(id);
        },
        clearPreview: base.clearPreview,
        clear: () => {
            base.clear();
            [...running.keys()].forEach(halt);
        },
    };
}
