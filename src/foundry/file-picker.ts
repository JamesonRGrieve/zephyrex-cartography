// SPDX-License-Identifier: AGPL-3.0-or-later
/** Foundry's own file picker, for the panels that take an image path. */

/** Pick an image with Foundry's file picker, starting from `current`. */
export async function pickImage(current: string | null, picked: (path: string) => void): Promise<void> {
    const picker = new foundry.applications.apps.FilePicker.implementation({ type: 'image', current: current ?? '', callback: picked });
    await picker.render({ force: true });
}
