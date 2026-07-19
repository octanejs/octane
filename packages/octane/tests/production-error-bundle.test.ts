// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { compile } from '../src/compiler/compile.js';

const OCTANE_SOURCE = resolve(import.meta.dirname, '../src');
const ERROR_CATALOG = JSON.parse(
	readFileSync(resolve(import.meta.dirname, '../error-codes/codes.json'), 'utf8'),
) as {
	codes: Record<
		string,
		{
			message: string;
			argumentCount: number;
			runtime: readonly ('client' | 'server')[];
			status: 'active' | 'retired';
		}
	>;
};
const MISSING_ARGUMENT = '[missing argument]';
const UNKNOWN_ERROR_CODE = 'Unknown Octane error code';

function surfaceEntries(surface: 'client' | 'server') {
	return Object.entries(ERROR_CATALOG.codes).filter(
		([, entry]) => entry.status === 'active' && entry.runtime.includes(surface),
	);
}

function argumentValue(code: string, index: number): string {
	return `artifact ${code}/${index} <octane> & spaces 😀 \uD800 \uDC00`;
}

function expectedMessage(code: string, message: string): string {
	let index = 0;
	return message.replace(/%s/g, () => argumentValue(code, index++));
}

function decodedStringLiterals(code: string): readonly string[] {
	const source = ts.createSourceFile('bundle.js', code, ts.ScriptTarget.Latest, true);
	const values: string[] = [];
	function visit(node: ts.Node): void {
		if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
			values.push(node.text);
		}
		ts.forEachChild(node, visit);
	}
	visit(source);
	return values;
}

function containsDecodedLiteral(literals: readonly string[], message: string): boolean {
	return literals.some((value) => value.includes(message));
}

type ErrorBundle = {
	code: string;
	messages: readonly string[];
};

async function bundleFormatter(
	surface: 'client' | 'server',
	mode: 'development' | 'production',
): Promise<ErrorBundle> {
	const formatter = `./error-codes.${surface}.generated.ts`;
	const exportName = surface === 'client' ? 'formatClientError' : 'formatServerError';
	const calls = `[${surfaceEntries(surface)
		.map(([code, entry]) => {
			const args = Array.from({ length: entry.argumentCount }, (_, index) =>
				JSON.stringify(argumentValue(code, index)),
			);
			return `${exportName}(${code}${args.length > 0 ? `,${args.join(',')}` : ''})`;
		})
		.join(',')}]`;
	const result = await build({
		stdin: {
			contents: `import { ${exportName} } from ${JSON.stringify(formatter)}; export const messages = ${calls};`,
			loader: 'js',
			resolveDir: OCTANE_SOURCE,
			sourcefile: `${surface}-${mode}-error-entry.js`,
		},
		bundle: true,
		define: { 'process.env.NODE_ENV': JSON.stringify(mode) },
		format: 'esm',
		logLevel: 'silent',
		minify: true,
		platform: 'neutral',
		target: 'esnext',
		treeShaking: true,
		write: false,
	});
	const code = result.outputFiles[0].text;
	const module = (await import(
		`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
	)) as { messages: readonly string[] };

	return { code, messages: module.messages };
}

async function bundleCompleteRuntime(surface: 'client' | 'server'): Promise<string> {
	const result = await build({
		entryPoints: [
			resolve(OCTANE_SOURCE, surface === 'client' ? 'runtime.ts' : 'runtime.server.ts'),
		],
		bundle: true,
		define: { 'process.env.NODE_ENV': '"production"' },
		format: 'esm',
		logLevel: 'silent',
		minify: true,
		platform: surface === 'client' ? 'browser' : 'node',
		target: 'esnext',
		treeShaking: true,
		write: false,
	});
	return result.outputFiles[0].text;
}

async function executePublicProductionError(surface: 'client' | 'server'): Promise<string> {
	const contents =
		surface === 'client'
			? `import { Children } from './runtime.ts';
				let message = '';
				try { Children.only(null); } catch (error) { message = error.message; }
				export { message };`
			: `import { createElement, renderToString } from './runtime.server.ts';
				const InvalidTag = () => createElement('bad tag', null);
				let message = '';
				try { renderToString(InvalidTag); } catch (error) { message = error.message; }
				export { message };`;
	const result = await build({
		stdin: {
			contents,
			loader: 'js',
			resolveDir: OCTANE_SOURCE,
			sourcefile: `${surface}-public-production-error.js`,
		},
		bundle: true,
		define: { 'process.env.NODE_ENV': '"production"' },
		format: 'esm',
		logLevel: 'silent',
		minify: true,
		platform: surface === 'client' ? 'browser' : 'node',
		target: 'esnext',
		treeShaking: true,
		write: false,
	});
	const module = (await import(
		`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
	)) as { message: string };
	return module.message;
}

async function executePublicProductionListenerError(): Promise<{
	message: string;
	called: number;
}> {
	const compiled = compile(
		`import { createRoot } from 'octane';
		export function InvalidListener(props) @{
			<button id="bad" onClick={props.bad}>{'bad'}</button>
		}`,
		'production-invalid-listener.tsrx',
		{ hmr: false, dev: false },
	).code.replace("from 'octane'", "from './index.ts'");
	const result = await build({
		stdin: {
			contents: `${compiled}
			const container = document.createElement('div');
			document.body.appendChild(container);
			let message = '';
			let called = 0;
			const onError = (event) => {
				message = event.error && event.error.message || event.message;
				event.preventDefault();
			};
			window.addEventListener('error', onError);
			const root = createRoot(container);
			root.render(InvalidListener, { bad: { fn: () => called++, args: [] } });
			container.querySelector('#bad').dispatchEvent(new MouseEvent('click', { bubbles: true }));
			root.unmount();
			window.removeEventListener('error', onError);
			container.remove();
			export { message, called };`,
			loader: 'js',
			resolveDir: OCTANE_SOURCE,
			sourcefile: 'client-public-production-listener-error.js',
		},
		bundle: true,
		define: { 'process.env.NODE_ENV': '"production"' },
		format: 'esm',
		logLevel: 'silent',
		minify: true,
		platform: 'browser',
		target: 'esnext',
		treeShaking: true,
		write: false,
	});
	const dom = new JSDOM('<!doctype html><html><body></body></html>', {
		url: 'https://octane.test/',
	});
	const globals = [
		'window',
		'self',
		'document',
		'navigator',
		'Node',
		'Element',
		'HTMLElement',
		'HTMLInputElement',
		'HTMLTextAreaElement',
		'HTMLSelectElement',
		'HTMLFormElement',
		'HTMLButtonElement',
		'DocumentFragment',
		'Text',
		'Comment',
		'Event',
		'ErrorEvent',
		'MouseEvent',
		'CustomEvent',
		'FormData',
		'MutationObserver',
	] as const;
	const previous = new Map<string, PropertyDescriptor | undefined>();
	try {
		for (const name of globals) {
			previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
			Object.defineProperty(globalThis, name, {
				configurable: true,
				writable: true,
				value: name === 'self' ? dom.window : (dom.window as any)[name],
			});
		}
		const module = (await import(
			`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
		)) as { message: string; called: number };
		return module;
	} finally {
		for (const name of globals) {
			const descriptor = previous.get(name);
			if (descriptor === undefined) delete (globalThis as any)[name];
			else Object.defineProperty(globalThis, name, descriptor);
		}
		dom.window.close();
	}
}

function decodedErrorUrl(message: string): URL {
	const match = message.match(/https:\/\/octanejs\.dev\/errors\/\d+(?:\?\S+)?/);
	expect(match, `expected an Octane error URL in ${JSON.stringify(message)}`).not.toBeNull();
	return new URL(match![0].replace(/[.,;:!?]+$/, ''));
}

describe('production error bundles', () => {
	it.each([{ surface: 'client' as const }, { surface: 'server' as const }])(
		'keeps complete $surface diagnostics in development',
		async ({ surface }) => {
			const entries = surfaceEntries(surface);
			const bundle = await bundleFormatter(surface, 'development');
			const literals = decodedStringLiterals(bundle.code);

			expect(bundle.messages).toEqual(
				entries.map(([code, entry]) => expectedMessage(code, entry.message)),
			);
			for (const [, entry] of entries) {
				expect(containsDecodedLiteral(literals, entry.message)).toBe(true);
			}
			expect(bundle.code).toContain(MISSING_ARGUMENT);
			expect(bundle.code).toContain(UNKNOWN_ERROR_CODE);
			for (const [, entry] of surfaceEntries(surface === 'client' ? 'server' : 'client')) {
				if (!entry.runtime.includes(surface)) {
					expect(containsDecodedLiteral(literals, entry.message)).toBe(false);
				}
			}
		},
	);

	it.each([{ surface: 'client' as const }, { surface: 'server' as const }])(
		'replaces complete $surface diagnostics with decodable codes in production',
		async ({ surface }) => {
			const entries = surfaceEntries(surface);
			const bundle = await bundleFormatter(surface, 'production');
			const literals = decodedStringLiterals(bundle.code);

			for (const entry of Object.values(ERROR_CATALOG.codes)) {
				expect(containsDecodedLiteral(literals, entry.message)).toBe(false);
			}
			expect(bundle.code).not.toContain(MISSING_ARGUMENT);
			expect(bundle.code).not.toContain(UNKNOWN_ERROR_CODE);
			for (const [index, [code, entry]] of entries.entries()) {
				const url = decodedErrorUrl(bundle.messages[index]);
				expect(url.pathname).toBe(`/errors/${Number(code)}`);
				expect(bundle.messages[index]).not.toContain(entry.message);
				expect(url.searchParams.getAll('args[]')).toEqual(
					Array.from({ length: entry.argumentCount }, (_, argumentIndex) =>
						argumentValue(code, argumentIndex).replace(/[\uD800-\uDFFF]/gu, '\uFFFD'),
					),
				);
			}
		},
	);

	it('strips full errors and development warnings from the complete optimized runtimes', async () => {
		const [client, server] = await Promise.all([
			bundleCompleteRuntime('client'),
			bundleCompleteRuntime('server'),
		]);
		const clientLiterals = decodedStringLiterals(client);
		const serverLiterals = decodedStringLiterals(server);

		for (const [code, entry] of Object.entries(ERROR_CATALOG.codes)) {
			if (entry.runtime.includes('client'))
				expect(containsDecodedLiteral(clientLiterals, entry.message), `client error ${code}`).toBe(
					false,
				);
			if (entry.runtime.includes('server'))
				expect(containsDecodedLiteral(serverLiterals, entry.message), `server error ${code}`).toBe(
					false,
				);
		}
		for (const warning of [
			'listener to be a function, instead got',
			'Received NaN for the',
			'Received `true` for a non-boolean attribute',
			'Invalid value for prop',
			'Unknown event handler property',
			'will stringify to "[object Object]"',
			'Invalid DOM property `autofocus`',
		]) {
			expect(client).not.toContain(warning);
			expect(server).not.toContain(warning);
		}
		expect(server).not.toContain('Octane SSR invalid HTML nesting');
		expect(client).not.toContain('octane.invalidEventListener');
		expect(client).toContain('https://octanejs.dev/errors/');
		expect(server).toContain('https://octanejs.dev/errors/');
	});

	it('emits the registered codes from bundled public client and server failures', async () => {
		const [clientMessage, serverMessage, listenerResult] = await Promise.all([
			executePublicProductionError('client'),
			executePublicProductionError('server'),
			executePublicProductionListenerError(),
		]);
		const clientUrl = decodedErrorUrl(clientMessage);
		const serverUrl = decodedErrorUrl(serverMessage);
		const listenerUrl = decodedErrorUrl(listenerResult.message);
		expect(clientUrl.pathname).toBe('/errors/2');
		expect(clientUrl.searchParams.getAll('args[]')).toEqual([]);
		expect(serverUrl.pathname).toBe('/errors/30');
		expect(serverUrl.searchParams.getAll('args[]')).toEqual(['bad tag']);
		expect(listenerUrl.pathname).toBe('/errors/46');
		expect(listenerUrl.searchParams.getAll('args[]')).toEqual(['click event', 'object']);
		expect(listenerResult.called).toBe(0);
	});
});
