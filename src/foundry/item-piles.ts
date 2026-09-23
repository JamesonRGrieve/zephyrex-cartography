// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * {@link ContainerService} over Item Piles (verified against its v3.3 API:
 * `createItemPile` resolves `{ tokenUuid, actorUuid }`, and `deleteItemPile`
 * takes the pile's TokenDocument). Item Piles is optional: when it is not
 * active the service reports unavailable and container stamps stay plain
 * stamps.
 */
import type { ContainerService } from '../canvas/controller';
import type { PileSpec } from '../tools/containers';
import { isRecord } from '../tools/guards';

const ITEM_PILES_ID = 'item-piles';

/** Item Piles' pile type for a lootable container, and kept when emptied (it is furniture, not a drop). */
const CONTAINER_FLAGS = { enabled: true, type: 'container', deleteWhenEmpty: false } as const;

interface CreatePileOptions {
    readonly position: { readonly x: number; readonly y: number };
    readonly sceneId: string;
    readonly tokenOverrides: object;
    readonly actorOverrides: object;
    readonly itemPileFlags: object;
}

/* eslint-disable @typescript-eslint/method-signature-style -- mirrors Item Piles' API object, whose members are methods */
interface ItemPilesApi {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Item Piles resolves an untyped result object, parsed below
    createItemPile(options: CreatePileOptions): Promise<unknown>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: takes the pile's TokenDocument and resolves nothing we read
    deleteItemPile(target: unknown): Promise<unknown>;
}
/* eslint-enable @typescript-eslint/method-signature-style */

// eslint-disable-next-line no-restricted-syntax -- boundary: validates the shape of Item Piles' global API object before any call
function isItemPilesApi(v: unknown): v is ItemPilesApi {
    return isRecord(v) && typeof v['createItemPile'] === 'function' && typeof v['deleteItemPile'] === 'function';
}

/** Item Piles' API, when the module is active. */
function itemPiles(): ItemPilesApi | null {
    if (![...(game.modules ?? [])].some((candidate) => candidate.id === ITEM_PILES_ID && candidate.active)) {
        return null;
    }
    const namespace = isRecord(game) ? game['itempiles'] : null;
    const api = isRecord(namespace) ? namespace['API'] : null;
    return isItemPilesApi(api) ? api : null;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: reads the token UUID out of createItemPile's result
function tokenUuidOf(result: unknown): string | null {
    return isRecord(result) && typeof result['tokenUuid'] === 'string' ? result['tokenUuid'] : null;
}

function tokenData(spec: PileSpec): object {
    return { width: spec.width, height: spec.height, rotation: spec.rotation, elevation: spec.elevation, texture: { src: spec.src } };
}

export function createItemPilesContainers(sceneId: () => string | null): ContainerService {
    return {
        available: () => itemPiles() !== null,
        create: async (spec, pileName) => {
            const api = itemPiles();
            const scene = sceneId();
            if (!api || scene === null) {
                return null;
            }
            return tokenUuidOf(
                await api.createItemPile({
                    position: { x: spec.x, y: spec.y },
                    sceneId: scene,
                    tokenOverrides: { ...tokenData(spec), name: pileName },
                    actorOverrides: { name: pileName },
                    itemPileFlags: CONTAINER_FLAGS,
                }),
            );
        },
        move: async (pile, spec) => {
            const token = foundry.utils.fromUuidSync(pile);
            if (token instanceof TokenDocument) {
                await token.update({ x: spec.x, y: spec.y, ...tokenData(spec) });
            }
        },
        remove: async (pile) => {
            const api = itemPiles();
            const token = foundry.utils.fromUuidSync(pile);
            if (api && token instanceof TokenDocument) {
                await api.deleteItemPile(token);
            }
        },
    };
}
