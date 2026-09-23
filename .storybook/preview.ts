// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Preview } from '@storybook/html-vite';
import '../src/styles/entry.css';
import './chrome.css';

const preview: Preview = {
    parameters: {
        layout: 'fullscreen',
        // Accessibility violations fail the a11y panel's checks rather than only warning.
        a11y: { test: 'error' },
    },
};

export default preview;
