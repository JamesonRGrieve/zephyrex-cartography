// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Storybook for the plugin's DOM views. Stories sit beside the view they
 * render (`src/ui/*.stories.ts`) so a rename keeps them in step. Vite picks up
 * the repo's PostCSS/Tailwind config on its own, so stories render with the
 * same `tw-` utilities as the module. Foundry's own CSS is not redistributable
 * and is not bundled; `.storybook/chrome.css` stands in for its window chrome.
 */
import type { StorybookConfig } from '@storybook/html-vite';

const config: StorybookConfig = {
    stories: ['../src/**/*.stories.ts'],
    staticDirs: [],
    addons: ['@storybook/addon-a11y'],
    framework: { name: '@storybook/html-vite', options: {} },
    core: { disableTelemetry: true },
};

export default config;
