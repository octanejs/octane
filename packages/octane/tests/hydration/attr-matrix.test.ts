import { describe, it, expect, vi } from 'vitest';
import { join } from 'node:path';
import { hydrateRoot, flushSync } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadServerFixture } from '../_server-fixture';
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
	HydratedAttributeValues,
} from './_fixtures/attr-matrix.tsrx';

// The client template emitter and the SSR emitter each carry their own
// per-attribute policy. Any attribute they treat differently shows up as a
// hydration mismatch: the server markup and the client's idea of that markup
// disagree, so hydration rebuilds instead of adopting.

const FIXTURE = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/attr-matrix.tsrx');

const server = loadServerFixture(FIXTURE, { id: 'attr-matrix.tsrx' });

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

	it.each(['matching', 'mismatched'] as const)(
		'keeps adopted attributes live after %s hydration',
		(mode) => {
			const serverProps = { text: 'server', on: true };
			const clientProps = {
				text: mode === 'matching' ? 'server' : 'client',
				on: mode === 'matching',
			};
			const container = document.createElement('div');
			document.body.appendChild(container);
			container.innerHTML = ServerRT.renderToString(
				server.HydratedAttributeValues,
				serverProps,
			).html;
			const button = container.querySelector('button')!;
			const link = container.querySelector('use')!;
			const custom = container.querySelector('octane-attribute-probe')!;
			const error = vi.spyOn(console, 'error').mockImplementation(() => {});
			let root: ReturnType<typeof hydrateRoot> | undefined;
			const assertValues = ({ text, on }: { text: string | null; on: boolean }) => {
				expect(container.querySelector('button')).toBe(button);
				expect(container.querySelector('use')).toBe(link);
				expect(container.querySelector('octane-attribute-probe')).toBe(custom);
				expect(button.getAttribute('title')).toBe(text);
				expect(button.getAttribute('data-label')).toBe(text);
				expect(button.disabled).toBe(on);
				expect(button.getAttribute('aria-expanded')).toBe(String(on));
				expect(link.getAttributeNS('http://www.w3.org/1999/xlink', 'href')).toBe(text);
				expect(link.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'lang')).toBe(text);
				expect(custom.getAttribute('customName')).toBe(text);
				expect(custom.getAttribute('hidden')).toBe(on ? '' : null);
			};
			try {
				root = hydrateRoot(container, HydratedAttributeValues, clientProps);
				flushSync(() => {});
				assertValues(clientProps);
				const mismatch = error.mock.calls.some((args) =>
					String(args[0]).includes('hydration mismatch'),
				);
				expect(mismatch).toBe(
					mode === 'mismatched' && process.env.OCTANE_TEST_COMPILE_MODE !== 'prod',
				);

				const updated = { text: 'updated', on: true };
				flushSync(() => root!.render(HydratedAttributeValues, updated));
				assertValues(updated);
				const removed = { text: null, on: false };
				flushSync(() => root!.render(HydratedAttributeValues, removed));
				assertValues(removed);
			} finally {
				root?.unmount();
				error.mockRestore();
				container.remove();
			}
		},
	);
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
