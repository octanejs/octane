// Loading the Lynx-for-Web runtime.
//
// @lynx-js/web-core's prebuilt client is copied to /lynx-runtime by
// scripts/prepare-lynx-examples.mjs and loaded from there rather than bundled
// into the app graph: it registers the whole Lynx custom-element set and pulls
// its own worker, wasm and element chunks, and only two pages ever mount a
// preview. Its chunk URLs resolve from `import.meta.url`, so the copied
// directory works wherever it is served as long as it stays whole.
//
// The stylesheet is 2 KB and every rule is scoped to `lynx-view` (plus a few
// `@property` registrations), so it cannot restyle the page around it.

import { LYNX_RUNTIME_BASE_PATH } from '../../content/lynx-examples.ts';

const CLIENT_SCRIPT = `${LYNX_RUNTIME_BASE_PATH}/static/js/client.js`;
const CLIENT_STYLES = `${LYNX_RUNTIME_BASE_PATH}/static/css/client.css`;

let pending: Promise<void> | null = null;

/**
 * Resolves once `<lynx-view>` is defined. Every caller shares one load; the
 * promise is cached even on failure so a broken deployment does not have every
 * preview on the page retry the same 404.
 */
export function loadLynxRuntime(): Promise<void> {
	if (typeof document === 'undefined') {
		return Promise.reject(new Error('The Lynx runtime only loads in a browser.'));
	}
	return (pending ??= new Promise<void>((resolve, reject) => {
		if (!document.querySelector(`link[href="${CLIENT_STYLES}"]`)) {
			const styles = document.createElement('link');
			styles.rel = 'stylesheet';
			styles.href = CLIENT_STYLES;
			document.head.append(styles);
		}

		const script = document.createElement('script');
		script.type = 'module';
		script.src = CLIENT_SCRIPT;
		// customElements.whenDefined() never settles when the script itself fails
		// to load, so the element registration races an explicit load failure
		// rather than waiting on it alone.
		script.addEventListener('error', () => {
			reject(new Error(`Could not load the Lynx runtime from ${CLIENT_SCRIPT}.`));
		});
		document.head.append(script);

		customElements.whenDefined('lynx-view').then(() => resolve(), reject);
	}));
}
