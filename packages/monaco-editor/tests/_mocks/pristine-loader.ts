/**
 * Pristine-lane loader double: resolves immediately like a held-ready mock, but
 * also injects the CDN loader script the real @monaco-editor/loader adds so
 * vendored RTL snapshots that capture `document.body` stay byte-stable.
 */
import type { Monaco } from '../_mocks/monaco';
import monaco from '../_mocks/monaco';

const CDN_LOADER = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs/loader.js';

let instance: Monaco | null = null;
let canceled = false;

type Cancelable = Promise<Monaco> & { cancel(): void };

function ensureLoaderScript(): void {
	if (typeof document === 'undefined') return;
	const existing = document.querySelector(`script[src="${CDN_LOADER}"]`);
	if (existing) return;
	const script = document.createElement('script');
	script.src = CDN_LOADER;
	document.body.appendChild(script);
}

function init(): Cancelable {
	canceled = false;
	ensureLoaderScript();
	const promise = Promise.resolve().then(() => {
		if (canceled) {
			const error = new Error('cancelation') as Error & { type?: string };
			error.type = 'cancelation';
			throw error;
		}
		instance = monaco;
		return monaco;
	}) as Cancelable;
	promise.cancel = () => {
		canceled = true;
	};
	return promise;
}

const loader = {
	init,
	config() {},
	__getMonacoInstance(): Monaco | null {
		return instance;
	},
};

export default loader;
