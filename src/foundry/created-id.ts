// SPDX-License-Identifier: AGPL-3.0-or-later
/** Reading back the one document a `createEmbeddedDocuments` call made. */

/** The id of the first document `created` (Foundry's createEmbeddedDocuments result) holds, or null. */
// eslint-disable-next-line no-restricted-syntax -- boundary: parses Foundry's createEmbeddedDocuments result to read the created document's id
export function firstCreatedId(created: unknown): string | null {
    const [doc] = Array.isArray(created) ? created : [];
    return typeof doc === 'object' && doc !== null && 'id' in doc && typeof doc.id === 'string' ? doc.id : null;
}
