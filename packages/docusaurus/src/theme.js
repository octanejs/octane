import { fileURLToPath } from 'node:url';

const THEME_PATH = fileURLToPath(new URL('./theme', import.meta.url));
const STYLES_PATH = fileURLToPath(new URL('./theme/styles.css', import.meta.url));

/**
 * Docusaurus theme plugin exposing Octane-authored docs route components.
 *
 * Add this function to `themes` in `docusaurus.config.*`. Docusaurus remains
 * responsible for content/plugin loading; the Octane Vite bridge resolves the
 * returned theme modules and imports the client stylesheet.
 */
export default function octaneClassicTheme() {
	return {
		name: '@octanejs/docusaurus-theme-classic',
		getThemePath() {
			return THEME_PATH;
		},
		getClientModules() {
			return [STYLES_PATH];
		},
	};
}

export { octaneClassicTheme };
