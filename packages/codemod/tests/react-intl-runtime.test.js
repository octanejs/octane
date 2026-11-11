import { mkdtemp, copyFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { runCodemod, transformModule } from '../dist/index.js';
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
		`export * from './page.tsrx'; export * from './rich.tsrx'; export * from './fields.tsrx'; export * from './locale.tsrx'; export * from './choices.tsrx'; export * from './reader.tsrx'; ${entry}
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
	const fields = transformModule(
		`import { useIntl, FormattedMessage } from 'react-intl';
		export function Fields({count}: {count: number}) {
			const intl = useIntl();
			return <section><input placeholder={intl.formatMessage({id:'hint'})} />
				<FormattedMessage id="count" values={{count}} /></section>;
		}`,
		'fields.tsx',
		{
			reactIntlAdapter: './react-intl.tsrx',
			reactCompat: true,
			unported: (name) => (name === 'react-intl' ? name : null),
		},
	);
	expect(fields.notes.filter((note) => note.severity === 'error')).toEqual([]);
	expect(fields.code).not.toMatch(/from ['"]react-intl['"]/);
	await writeFile(path.join(project, 'fields.tsrx'), fields.code);
	const locale = transformModule(
		`import {IntlProvider as Provider, useIntl} from 'react-intl';
		function Language() { const { 'locale': lang } = useIntl(); return <p lang={lang}>{lang}</p>; }
		export function OwnedLocale() { return <Provider locale="fr"><Language/></Provider>; }`,
		'locale.tsx',
		{
			reactIntlAdapter: './react-intl.tsrx',
			reactCompat: true,
			reactStoreComponent: (name) => name === 'react-intl',
			unported: (name) => (name === 'react-intl' ? name : null),
		},
	);
	expect(locale.notes.filter((note) => note.severity === 'error')).toEqual([]);
	await writeFile(path.join(project, 'locale.tsrx'), locale.code);
	const choices = transformModule(
		`import { ReactCompat as Boundary } from 'octane/react';
		import * as Bridge from 'octane/react';
		import { FormattedMessage as Message } from 'react-intl';
		import { IntlProvider as Provider, intlContexts } from './react-intl.tsrx';
		export function Choice({first}) { return <Provider locale="en"><Boundary contexts={intlContexts}>
			{/* Keep this message in React. */}
			{first ? (<Message id="a" defaultMessage="First" />) : <Message id="b" defaultMessage="Second" />}{}</Boundary></Provider>; }
		export function Namespaced() { return <Provider locale="en"><Bridge.ReactCompat contexts={intlContexts}>{}{(<Message id="b" defaultMessage="Second" />)}{/* end */}</Bridge.ReactCompat></Provider>; }`,
		'choices.tsx',
		{
			reactIntlAdapter: './react-intl.tsrx',
			reactCompat: true,
			unported: (name) => (['react-intl', 'octane/react'].includes(name) ? name : null),
		},
	);
	expect(choices.notes.filter((note) => note.severity === 'error')).toEqual([]);
	expect(choices.unported.map((port) => port.name)).not.toContain('octane/react');
	await writeFile(path.join(project, 'choices.tsrx'), choices.code);
	const rich = transformModule(
		"import { FormattedMessage } from 'react-intl';\n" +
			"import { RawIntlProvider as Provider } from './react-intl.tsrx';\n" +
			"export function Rich() { return <FormattedMessage id='rich' values={{bold: part => <strong key='emphasis' className='accent'>\n  {part}\n</strong>, person: (<span key='person' id='person'/>), lineBreak: <br/>}} />; }\n" +
			'export function NativeRich({formatter}) { return <Provider value={formatter}><Rich/></Provider>; }',
		'rich.tsx',
		{
			reactCompat: true,
			unported: (name) => (name === 'react-intl' ? name : null),
			reactIntlAdapter: './react-intl.tsrx',
			reactStoreComponent: (name) => name === 'react-intl',
		},
	);
	expect(rich.notes.filter((n) => n.severity === 'error')).toEqual([]);
	await writeFile(path.join(project, 'rich.tsrx'), rich.code);
	const badge = path.join(project, 'badge.tsx'),
		reader = path.join(project, 'reader.tsx');
	await writeFile(path.join(project, 'package.json'), '{}');
	await writeFile(
		badge,
		`export function Badge({size,...props}) {
			if (props.href) return <a {...props}/>;
			return <button type="button" data-size={size} {...props}/>;
		}`,
	);
	await writeFile(
		reader,
		`import {Badge} from './badge'; import {useIntl} from 'react-intl';
		export function Label({href}) {const label=useIntl().formatMessage({id:'greeting'}); return <Badge href={href} aria-label={label}/>;}`,
	);
	const converted = await runCodemod([reader, badge], {
		root: project,
		write: true,
		strong: true,
		projectTypes: false,
	});
	expect(
		converted.files
			.flatMap((f) => [...f.diagnostics, ...f.notes])
			.filter((d) => d.severity === 'error'),
	).toEqual([]);
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

it('preserves a locale binding under the component’s own Intl provider during SSR', async () => {
	const { intl, react, renderToString, prerender, OwnedLocale } = server;
	const h = react.createElement;
	function Language() {
		const { locale: lang } = intl.useIntl();
		return h('p', { lang }, lang);
	}
	const original = h(intl.IntlProvider, { locale: 'fr' }, h(Language));
	expect(paragraph((await prerender(OwnedLocale, {})).html)).toEqual(
		paragraph(renderToString(original)),
	);
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

it('transports one original React message from either conditional branch of an authored island', async () => {
	for (const [component, props, text] of [
		[server.Choice, { first: true }, 'First'],
		[server.Choice, { first: false }, 'Second'],
		[server.Namespaced, {}, 'Second'],
	]) {
		const { html } = await server.prerender(component, props);
		const result = document.createElement('template');
		result.innerHTML = html;
		expect(result.content.textContent).toBe(text);
	}
});

it('renders scalar substitutions and localized host attributes like the original React component', async () => {
	const { react, intl, reactRoot, OctaneCompat, Fields } = client;
	const h = react.createElement;
	const reference = document.createElement('div');
	const migrated = document.createElement('div');
	const roots = [reactRoot(reference), reactRoot(migrated)];
	const rendered = (host) => [
		host.querySelector('input').placeholder,
		host.querySelector('section').textContent,
	];
	try {
		for (const [locale, count, rich] of [
			['en', 1, false],
			['fr', 3, true],
		]) {
			const config = {
				locale,
				messages: {
					hint: rich ? '<em>Rechercher</em>' : 'Search',
					count: rich ? '<em>{count} articles</em>' : '{count} item',
				},
				defaultRichTextElements: rich
					? { em: (parts) => h('em', { key: 'em' }, parts) }
					: undefined,
				onWarn() {},
			};
			const original = () =>
				h(
					'section',
					null,
					h('input', { placeholder: intl.useIntl().formatMessage({ id: 'hint' }) }),
					h(intl.FormattedMessage, { id: 'count', values: { count } }),
				);
			await react.act(async () => {
				roots[0].render(h(intl.IntlProvider, config, h(original)));
				roots[1].render(
					h(intl.IntlProvider, config, h(OctaneCompat, { component: Fields, props: { count } })),
				);
			});
			expect(rendered(migrated)).toEqual(rendered(reference));
			expect(migrated.querySelector('em')?.textContent).toEqual(
				reference.querySelector('em')?.textContent,
			);
		}
	} finally {
		await react.act(async () => roots.forEach((root) => root.unmount()));
	}
});

it('keeps React ownership of inline rich substitutions on the client and server', async () => {
	const { react, reactRoot } = client;
	const reference = document.createElement('div');
	const migrated = document.createElement('div');
	const roots = [reactRoot(reference), reactRoot(migrated)];
	const config = (react, locale, text) => ({
		locale,
		messages: { rich: `<outer><bold>${text}</bold>{person}{lineBreak}</outer>` },
		onWarn() {},
		defaultRichTextElements: {
			outer: (chunks) =>
				chunks.map((child) => {
					if (!react.isValidElement(child)) throw new Error('Expected a React element');
					return react.cloneElement(child, { title: 'From React', 'data-key': child.key });
				}),
		},
	});
	const display = ({ react, intl, OctaneCompat, Rich }, locale, text, migrated) => {
		const h = react.createElement;
		return h(
			intl.IntlProvider,
			config(react, locale, text),
			migrated
				? h(OctaneCompat, { component: Rich, props: {} })
				: h(intl.FormattedMessage, {
						id: 'rich',
						values: {
							bold: (part) => h('strong', { key: 'emphasis', className: 'accent' }, part),
							person: h('span', { key: 'person', id: 'person' }),
							lineBreak: h('br'),
						},
					}),
		);
	};
	const observed = (host) =>
		Array.from(host.querySelectorAll('strong, #person, br'), (node) => [
			node.localName,
			node.className,
			node.textContent,
			node.title,
			node.getAttribute('data-key'),
		]);
	try {
		for (const [locale, text] of [
			['en', 'Text'],
			['fr', 'Texte'],
		]) {
			await react.act(async () => {
				roots[0].render(display(client, locale, text, false));
				roots[1].render(display(client, locale, text, true));
			});
			expect(observed(migrated).map(([tag, , content]) => [tag, content])).toEqual([
				['strong', text],
				['span', ''],
				['br', ''],
			]);
			const expected = observed(reference);
			expect(observed(migrated)).toEqual(expected);
			const ssr = await server.prerender(server.NativeRich, {
				formatter: server.intl.createIntl(config(server.react, locale, text)),
			});
			for (const html of [server.renderToString(display(server, locale, text, false)), ssr.html]) {
				const markup = document.createElement('template');
				markup.innerHTML = html;
				expect(observed(markup.content)).toEqual(expected);
			}
		}
	} finally {
		await react.act(async () => roots.forEach((root) => root.unmount()));
	}
});

it.each([
	['a custom JSX runtime', '/** @jsxImportSource custom-renderer */', 'id="rich"', ''],
	['an effectful attribute', '', 'id={read()}', ''],
	['an effectful substitution', '', 'id="rich"', ', sibling: read()'],
	['an attributed import', '', 'id="rich"', '', ' with {variant: "other"}'],
])(
	'keeps a diagnostic for an inline rich value with %s',
	(_label, pragma, id, sibling, attributes = '') => {
		const result = transformModule(
			`${pragma}
		import {FormattedMessage} from 'react-intl'${attributes};
		let phase = "before";
		function read() { return phase; }
		function Frame({children}) { phase = "after"; return <div>{children}</div>; }
		export function Rich() {
			phase = "before";
			return <Frame><FormattedMessage ${id} values={{break: <br/>${sibling}}}/></Frame>;
		}`,
			'rich.tsx',
			{
				reactCompat: true,
				unported: (name) => (name === 'react-intl' ? name : null),
				reactIntlAdapter: './react-intl.tsrx',
				reactStoreComponent: (name) => name === 'react-intl',
			},
		);
		expect(result.notes).toContainEqual(
			expect.objectContaining({ rule: 'bindings', severity: 'error' }),
		);
	},
);

it('keeps forwarded accessibility labels in sync with React across locale and element changes', async () => {
	const { react, intl, reactRoot, OctaneCompat, Label } = client;
	const h = react.createElement;
	function Original({ href }) {
		return h(href ? 'a' : 'button', {
			href,
			'aria-label': intl.useIntl().formatMessage({ id: 'greeting' }),
		});
	}
	const el = document.createElement('main');
	const root = reactRoot(el);
	try {
		for (const [locale, message, href] of [
			['en', 'Greeting'],
			['fr', '<em>Bonjour</em>', '#details'],
			['de', 'Hallo'],
		]) {
			const config = {
				locale,
				messages: { greeting: message },
				defaultRichTextElements: { em: (parts) => h('em', { key: 'em' }, parts) },
				onWarn() {},
			};
			await react.act(async () =>
				root.render(
					h(
						intl.IntlProvider,
						config,
						h(Original, { href }),
						h(OctaneCompat, { component: Label, props: { href } }),
					),
				),
			);
			const labels = [...el.querySelectorAll(href ? 'a[href="#details"]' : 'button')].map((node) =>
				node.getAttribute('aria-label'),
			);
			const expected = locale === 'fr' ? '[object Object]' : message;
			expect(labels).toEqual([expected, expected]);
		}
	} finally {
		await react.act(async () => root.unmount());
	}
});
