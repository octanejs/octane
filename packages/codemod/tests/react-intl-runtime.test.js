import { mkdtemp, copyFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { transformModule } from '../dist/index.js';
import { bundleRuntime, installDOM } from './bundle-runtime.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
let project;
let dom;
let client;
let server;
async function load(mode) {
	const entry =
		mode === 'server'
			? "export { prerender } from 'octane/static';"
			: "export { createRoot, flushSync } from 'octane'; export { createRoot as reactRoot } from 'react-dom/client';";
	return bundleRuntime(
		project,
		mode,
		`export * from './page.tsrx'; export * from './rich.tsrx'; ${entry}
				export { OctaneCompat } from 'octane/react${mode === 'server' ? '/server' : ''}';
				export * as react from 'react'; export * as intl from 'react-intl';
				export { renderToString } from 'react-dom/server';`,
		['react-intl'],
	);
}

beforeAll(async () => {
	dom = installDOM();
	project = await mkdtemp(path.join(os.tmpdir(), 'octane-intl-'));
	await symlink(path.join(testDir, '../node_modules'), path.join(project, 'node_modules'), 'dir');
	await copyFile(
		path.join(testDir, '../templates/react-intl.tsrx'),
		path.join(project, 'react-intl.tsrx'),
	);
	await copyFile(
		path.join(testDir, 'fixtures/react-intl/page.tsrx'),
		path.join(project, 'page.tsrx'),
	);
	const rich = transformModule(
		"import { FormattedMessage } from 'react-intl';\n" +
			"export function Rich() { return <FormattedMessage id='rich' values={{bold: part => <strong className='accent'>{part}</strong>}} />; }",
		'rich.tsx',
		{
			reactCompat: true,
			unported: (name) => (name === 'react-intl' ? name : null),
			reactIntlAdapter: './react-intl.tsrx',
		},
	);
	expect(rich.notes.filter((n) => n.severity === 'error')).toEqual([]);
	await writeFile(path.join(project, 'rich.tsrx'), rich.code);
	[client, server] = await Promise.all([load('client'), load('server')]);
});
afterAll(async () => {
	dom?.window.close();
	vi.unstubAllGlobals();
	if (project) await rm(project, { recursive: true, force: true });
});

const english = { locale: 'en', messages: { greeting: 'Hello' } };
const french = { locale: 'fr', messages: { greeting: 'Bonjour' } };
function paragraph(html) {
	const template = document.createElement('template');
	template.innerHTML = html;
	const p = template.content.querySelector('p');
	return [p.lang, p.textContent, p.childElementCount];
}

it('uses the nearest native or React-owned formatter and respects an explicitly empty native provider', async () => {
	const { intl, react, renderToString, OctaneCompat, Message, Local, prerender } = server;
	const h = react.createElement;
	const reference = h(
		intl.IntlProvider,
		english,
		h(
			intl.IntlProvider,
			french,
			h('p', { lang: 'fr' }, h(intl.FormattedMessage, { id: 'greeting' })),
		),
	);
	const hosted = h(
		intl.IntlProvider,
		english,
		h(intl.IntlProvider, french, h(OctaneCompat, { component: Message, props: {} })),
	);
	expect(paragraph(renderToString(hosted))).toEqual(paragraph(renderToString(reference)));
	const shape = intl.createIntl(french);
	const native = await prerender(Local, { config: english, raw: shape, providedRaw: true });
	expect(paragraph(native.html)).toEqual(['fr', 'Bonjour', 0]);
	for (const value of [null, undefined]) {
		const masked = h(
			intl.IntlProvider,
			french,
			h(OctaneCompat, {
				component: Local,
				props: { config: english, raw: value, providedRaw: true },
			}),
		);
		expect(() => renderToString(masked)).toThrow(/IntlProvider/);
	}
});

it('updates native text and formatter configuration, and preserves the formatter through child-only updates', () => {
	const container = document.createElement('div');
	const root = client.createRoot(container);
	const seen = [];
	const draw = (config) =>
		client.flushSync(() =>
			root.render(client.Local, { config, inspect: (value) => seen.push(value) }),
		);
	try {
		draw(english);
		expect(container.querySelector('p').textContent).toBe('Hello');
		const before = seen.at(-1);
		draw({ ...english, timeZone: undefined });
		expect(seen.at(-1)).toBe(before);
		draw({ ...french, timeZone: 'UTC' });
		expect(container.querySelector('p').textContent).toBe('Bonjour');
		expect(container.querySelector('p').childElementCount).toBe(0);
		expect(seen.at(-1).timeZone).toBe('UTC');
	} finally {
		root.unmount();
	}
});

it('passes the same formatter to a React display island and delegates a custom text component', async () => {
	const { Local, prerender, intl, react, renderToString } = server;
	const config = { ...french, textComponent: 'strong' };
	const native = await prerender(Local, { config });
	const html = document.createElement('template');
	html.innerHTML = native.html;
	expect(html.content.querySelector('strong').textContent).toBe('Bonjour');
	const island = await prerender(Local, { config: french, mirror: true });
	html.innerHTML = island.html;
	const h = react.createElement;
	const reference = renderToString(
		h(intl.IntlProvider, french, h(intl.FormattedNumber, { value: 1234.5 })),
	);
	expect(html.content.textContent).toBe(reference);
});

it('follows a React host locale update and uses the genuine formatter for rich translations', async () => {
	const { react, intl, reactRoot, OctaneCompat, Message } = client;
	const host = document.createElement('div');
	const root = reactRoot(host);
	const h = react.createElement;
	function Decorate({ children }) {
		return h('em', { lang: intl.useIntl().locale }, children);
	}
	const rich = intl.createIntl({
		...french,
		defaultRichTextElements: { em: (parts) => h(Decorate, { key: 'em' }, parts) },
		messages: { greeting: '<em>Salut</em>' },
		onWarn() {},
	});
	async function show(value) {
		await react.act(async () =>
			root.render(
				h(
					intl.IntlProvider,
					english,
					h(intl.RawIntlProvider, { value }, h(OctaneCompat, { component: Message, props: {} })),
				),
			),
		);
	}
	try {
		await show(intl.createIntl(french));
		expect(host.querySelector('p').textContent).toBe('Bonjour');
		await show(rich);
		expect(host.querySelector('em').textContent).toBe('Salut');
		expect(host.querySelector('em').lang).toBe('fr');
		await show(intl.createIntl(english));
		expect(host.querySelector('p').textContent).toBe('Hello');
		expect(host.querySelector('p').childElementCount).toBe(0);
	} finally {
		await react.act(async () => root.unmount());
	}
});

it('hands a real React element from a migrated inline callback back to the unported library', async () => {
	const { react, intl, reactRoot, OctaneCompat, Rich } = client;
	const h = react.createElement;
	const el = document.createElement('div');
	const root = reactRoot(el);
	const config = {
		locale: 'en',
		messages: { rich: '<outer><bold>Text</bold></outer>' },
		onWarn() {},
		defaultRichTextElements: {
			outer: (chunks) =>
				chunks.map((child) => {
					if (!react.isValidElement(child)) throw new Error('Expected a React element');
					return react.cloneElement(child, { title: 'From React' });
				}),
		},
	};
	try {
		await react.act(async () =>
			root.render(h(intl.IntlProvider, config, h(OctaneCompat, { component: Rich, props: {} }))),
		);
		const result = el.querySelector('strong.accent');
		expect(result.textContent).toBe('Text');
		expect(result.title).toBe('From React');
	} finally {
		await react.act(async () => root.unmount());
	}
});
