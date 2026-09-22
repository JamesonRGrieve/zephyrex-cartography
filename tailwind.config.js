// SPDX-License-Identifier: AGPL-3.0-or-later
/** @type {import('tailwindcss').Config} */
export default {
    content: ['./src/**/*.{ts,html}'],
    // Utilities are namespaced (tw-) and scoped to the plugin's HUD root so they
    // never leak into Foundry's own chrome.
    prefix: 'tw-',
    important: '.cartography-draw',
    theme: { extend: {} },
    plugins: [],
};
