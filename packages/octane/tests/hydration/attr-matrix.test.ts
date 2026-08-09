import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import { hydrateRoot, flushSync } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import {
	BooleanAttrs,
	ValueAttrs,
	EnumeratedAndAria,
	NamedAndAliased,
	FormAttrs,
	AutoFocusSpread,
	NamespacedTags,
	WhitespaceSensitive,
	ClassComposition,
	SpreadProps,
	StyleShapes,
	DangerAndSuppress,
	EnumeratedBooleans,
} from './_fixtures/attr-matrix.tsrx';

// The client template emitter and the SSR emitter each carry their own
// per-attribute policy. Any attribute they treat differently shows up as a
// hydration mismatch: the server markup and the client's idea of that markup
// disagree, so hydration rebuilds instead of adopting.

const FIXTURE = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/attr-matrix.tsrx');

function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'attr-matrix.tsrx', { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, '__exports.$1 = function $1');
	const fn = new Function('__rt', '__exports', code + '\nreturn __exports;');
	return fn(ServerRT, {});
}
const server = serverModule();

const PROPS = [
	{
		label: 'truthy',
		value: {
			on: true,
			text: 'alpha',
			num: 3,
			html: '<b>x</b>',
			spread: { id: 'sp', title: 't', hidden: true },
		},
	},
	{
		label: 'falsy',
		value: { on: false, text: '', num: 0, html: '', spread: { id: '', title: '', hidden: false } },
	},
];

const CASES: Array<[string, any]> = [
	['BooleanAttrs', BooleanAttrs],
	['ValueAttrs', ValueAttrs],
	['EnumeratedAndAria', EnumeratedAndAria],
	['NamedAndAliased', NamedAndAliased],
	['FormAttrs', FormAttrs],
	['NamespacedTags', NamespacedTags],
	['WhitespaceSensitive', WhitespaceSensitive],
	['ClassComposition', ClassComposition],
	['SpreadProps', SpreadProps],
	['StyleShapes', StyleShapes],
	['DangerAndSuppress', DangerAndSuppress],
	['EnumeratedBooleans', EnumeratedBooleans],
];

describe('client and SSR attribute policy agree', () => {
	for (const [name, ClientComponent] of CASES) {
		for (const { label, value } of PROPS) {
			it(`${name} hydrates without rebuilding (${label} props)`, async () => {
				const { html } = await ServerRT.renderToString(server[name], value);
				const container = document.createElement('div');
				document.body.appendChild(container);
				container.innerHTML = html;
				const serverDom = container.innerHTML;

				const warnings: string[] = [];
				const originalWarn = console.warn;
				const originalError = console.error;
				console.warn = (...args: unknown[]) => warnings.push(String(args[0]));
				console.error = (...args: unknown[]) => warnings.push(String(args[0]));
				try {
					const root = hydrateRoot(container, ClientComponent, value);
					flushSync(() => {});
					// Adoption, not reconstruction: identical markup after hydration.
					expect(container.innerHTML, `${name} markup after hydration (${label})`).toBe(serverDom);
					expect(
						warnings.filter((w) => /mismatch|hydrat/i.test(w)),
						`${name} hydration warnings (${label})`,
					).toEqual([]);
					root.unmount();
				} finally {
					console.warn = originalWarn;
					console.error = originalError;
					container.remove();
				}
			});
		}
	}
});

describe('server autofocus survives hydration without stealing focus', () => {
	// Per ReactServerRenderingHydration-test.js:161, the server attribute enables
	// browser autofocus before hydration, but adoption must never call focus().
	it('adopts a direct server autofocus attribute and preserves existing focus', () => {
		const props = { on: true, text: '#form' };
		const { html } = ServerRT.renderToString(server.FormAttrs, props);
		const container = document.createElement('div');
		const outside = document.createElement('button');
		document.body.append(container, outside);
		container.innerHTML = html;
		const input = container.querySelector('.f3') as HTMLInputElement;
		expect(input.getAttribute('autofocus')).toBe('');
		outside.focus();
		let root: ReturnType<typeof hydrateRoot> | undefined;
		try {
			root = hydrateRoot(container, FormAttrs, props);
			flushSync(() => {});
			expect(container.querySelector('.f3')).toBe(input);
			expect(input.getAttribute('autofocus')).toBe('');
			expect(document.activeElement).toBe(outside);

			flushSync(() => root!.render(FormAttrs, { on: false, text: '#form' }));
			flushSync(() => root!.render(FormAttrs, props));
			expect(document.activeElement).toBe(outside);
		} finally {
			root?.unmount();
			container.remove();
			outside.remove();
		}
	});

	it('adopts spread-supplied autofocus without focusing the server element', () => {
		const props = { attributes: { autoFocus: true } };
		const { html } = ServerRT.renderToString(server.AutoFocusSpread, props);
		const container = document.createElement('div');
		const outside = document.createElement('button');
		document.body.append(container, outside);
		container.innerHTML = html;
		const input = container.querySelector('input') as HTMLInputElement;
		expect(input.getAttribute('autofocus')).toBe('');
		outside.focus();
		let root: ReturnType<typeof hydrateRoot> | undefined;
		try {
			root = hydrateRoot(container, AutoFocusSpread, props);
			flushSync(() => {});
			expect(container.querySelector('input')).toBe(input);
			expect(input.getAttribute('autofocus')).toBe('');
			expect(document.activeElement).toBe(outside);
		} finally {
			root?.unmount();
			container.remove();
			outside.remove();
		}
	});

	it('still focuses a fresh client element replacing mismatched server markup', () => {
		const props = { attributes: { autoFocus: true } };
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = '<span id="stale-server-element"></span>';
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		let root: ReturnType<typeof hydrateRoot> | undefined;
		try {
			root = hydrateRoot(container, AutoFocusSpread, props);
			flushSync(() => {});
			expect(document.activeElement).toBe(container.querySelector('input'));
			expect(container.querySelector('#stale-server-element')).toBeNull();
		} finally {
			root?.unmount();
			error.mockRestore();
			container.remove();
		}
	});
});
