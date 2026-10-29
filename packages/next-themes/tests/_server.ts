import { resolve } from 'node:path';
import { vi } from 'vitest';
import * as ServerRuntime from 'octane/server';
import { loadServerFixture } from '../../octane/tests/_server-fixture';
import { script } from '../src/script';
import type { ThemeProviderProps } from '../src/index.tsrx';
import type { ThemedAppProps } from './_fixtures/app.tsrx';

// A server has no `window`. next-themes reads it once at module load (whether
// to touch localStorage) and again per render (whether to keep the nonce), so
// it is hidden around both.
function withoutWindow<T>(run: () => T): T {
	vi.stubGlobal('window', undefined);
	try {
		return run();
	} finally {
		vi.unstubAllGlobals();
	}
}

const { themes, app } = withoutWindow(() => {
	const themes = loadServerFixture(resolve(import.meta.dirname, '../src/index.tsrx'), {
		runtimeModules: { './script': { script } },
	});
	const app = loadServerFixture(resolve(import.meta.dirname, '_fixtures/app.tsrx'), {
		runtimeModules: { '../../src/index.tsrx': themes },
	});
	return { themes, app };
});

/** Server-render the provider alone, as octane/server would. */
export function renderProviderToString(props: ThemeProviderProps): string {
	return withoutWindow(() => ServerRuntime.renderToString(themes.ThemeProvider, props).html);
}

/** Server-render the provider around the mounted-guarded toggle fixture. */
export function renderAppToString(props: ThemedAppProps): string {
	return withoutWindow(() => ServerRuntime.renderToString(app.ThemedApp, props).html);
}

/** Run a server-rendered inline script the way the browser does before first paint. */
export function runInlineScript(scriptElement: HTMLScriptElement): void {
	new Function(scriptElement.textContent ?? '')();
}
