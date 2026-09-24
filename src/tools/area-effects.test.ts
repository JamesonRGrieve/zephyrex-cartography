// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
    AREA_EFFECT_KINDS,
    effectsOf,
    newAreaEffect,
    parseAreaEffects,
    parseModifier,
    parseUuidLines,
    REGION_EVENTS,
    storedEffects,
    TEXT_EVENTS,
    withEvent,
} from './area-effects';

describe('area effects', () => {
    it('start as Foundry makes each behaviour', () => {
        expect(AREA_EFFECT_KINDS.map(newAreaEffect)).toEqual([
            { kind: 'darkness', mode: 'override', modifier: 0 },
            { kind: 'suppressWeather' },
            { kind: 'text', text: '', colour: '#ffffff', visibility: 'anyone', once: false, events: [] },
            { kind: 'pause', once: false },
            { kind: 'macro', uuid: null, everyone: false, events: [] },
            { kind: 'script', source: '', events: [] },
            { kind: 'activeEffect', effects: [] },
        ]);
    });

    it('round-trip through the scene flag, every kind', () => {
        const effects = [
            { kind: 'darkness', mode: 'darken', modifier: 0.4 },
            { kind: 'suppressWeather' },
            { kind: 'text', text: 'Hot!', colour: '#ff0000', visibility: 'gamemaster', once: true, events: ['tokenTurnStart'] },
            { kind: 'pause', once: true },
            { kind: 'macro', uuid: 'Macro.x', everyone: true, events: ['tokenEnter', 'behaviorActivated'] },
            { kind: 'script', source: 'return 1;', events: ['tokenExit'] },
            { kind: 'activeEffect', effects: ['Actor.a.ActiveEffect.b'] },
        ];
        expect(parseAreaEffects(JSON.parse(JSON.stringify(effects)))).toEqual(effects);
    });

    it('drop what is malformed and fall back to Foundry’s defaults field by field', () => {
        expect(
            parseAreaEffects([
                'x',
                { kind: 'teleport' },
                { kind: 'darkness', mode: 'dim', modifier: 3 },
                { kind: 'text', colour: 'red', visibility: 'players', events: ['tokenEnter', 'tokenTurnEnd'] },
                { kind: 'macro', uuid: '', events: 'tokenEnter' },
                { kind: 'activeEffect', effects: ['', 'Item.e'] },
            ]),
        ).toEqual([
            { kind: 'darkness', mode: 'override', modifier: 0 },
            // Scrolling text cannot subscribe to a token entering.
            { kind: 'text', text: '', colour: '#ffffff', visibility: 'anyone', once: false, events: ['tokenTurnEnd'] },
            { kind: 'macro', uuid: null, everyone: false, events: [] },
            { kind: 'activeEffect', effects: ['Item.e'] },
        ]);
        expect(parseAreaEffects(undefined)).toBeUndefined();
        expect(parseAreaEffects([])).toBeUndefined();
    });

    it('are stored only when there are some', () => {
        expect(storedEffects([])).toBeUndefined();
        expect(storedEffects([{ kind: 'suppressWeather' }])).toEqual([{ kind: 'suppressWeather' }]);
        expect(effectsOf({})).toEqual([]);
    });

    it('take a darkness modifier from 0 to 1', () => {
        expect(parseModifier('0.25')).toBe(0.25);
        expect(parseModifier('1')).toBe(1);
        expect(parseModifier('1.5')).toBeNull();
        expect(parseModifier('')).toBeNull();
    });

    it('subscribe and unsubscribe events, kept in Foundry’s order', () => {
        const events = withEvent(REGION_EVENTS, ['tokenExit'], 'tokenEnter', true);
        expect(events).toEqual(['tokenEnter', 'tokenExit']);
        expect(withEvent(REGION_EVENTS, events, 'tokenExit', false)).toEqual(['tokenEnter']);
        expect(withEvent(TEXT_EVENTS, [], 'tokenRoundEnd', true)).toEqual(['tokenRoundEnd']);
    });

    it('read UUIDs one per line', () => {
        expect(parseUuidLines(' a \n\n  b\n')).toEqual(['a', 'b']);
    });
});
