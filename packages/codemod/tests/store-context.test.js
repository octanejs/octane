// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createContext, createElement as h } from 'react';
import { createRoot as createReactRoot } from 'react-dom/client';
import { flushSync as flushReact } from 'react-dom';
import { renderToString as renderReact } from 'react-dom/server';
import { OctaneCompat } from 'octane/react';
import { OctaneCompat as ServerCompat } from 'octane/react/server';
import { renderToString } from 'octane/server';
import { expect, it } from 'vitest';
import { mount } from '../../octane/tests/_helpers.js';
import { loadCompiledFixtureSource } from '../../octane/tests/_server-fixture.js';

const source = readFileSync(
	path.resolve(import.meta.dirname, '../templates/octane-store-context.tsrx'),
	'utf8',
);
const page = `import { useStoreContext, NativeStoreProvider } from './store-context.tsrx';
export function Read({ a, b }) @{
	const first = useStoreContext(a);
	const second = useStoreContext(b);
	<p>{String(first)}|{String(second)}</p>
}
export function Mixed({ a, b, inner, context = a }) @{
	<NativeStoreProvider context={context} value={inner}><Read a={a} b={b} /></NativeStoreProvider>
}
export function Standalone({ a, b, outer, inner }) @{
	<NativeStoreProvider context={b} value="second">
		<NativeStoreProvider context={a} value={outer}>
			<Read a={a} b={b} />
			<Mixed a={a} b={b} inner={inner} />
			<Read a={a} b={b} />
		</NativeStoreProvider>
	</NativeStoreProvider>
}`;

function fixture(mode) {
	const helper = loadCompiledFixtureSource(source, { id: 'store-context.tsrx', mode });
	return loadCompiledFixtureSource(page, {
		id: 'page.tsrx',
		mode,
		runtimeModules: { './store-context.tsrx': helper },
	});
}

function contents(html) {
	const template = document.createElement('template');
	template.innerHTML = html;
	return Array.from(template.content.querySelectorAll('p'), (p) => p.textContent);
}

it('uses the nearest native provider for each original context, including null and undefined', () => {
	const a = createContext('default');
	const b = createContext('default');
	const server = fixture('server');
	const client = fixture('client');
	const props = { a, b, outer: 'first', inner: null };
	const view = mount(client.Standalone, props);
	const other = mount(client.Standalone, { ...props, outer: 'other', inner: 'separate' });
	try {
		for (const inner of [null, undefined, 'updated']) {
			const next = { ...props, inner };
			const expected = ['first|second', String(inner) + '|second', 'first|second'];
			expect(contents(renderToString(server.Standalone, next).html)).toEqual(expected);
			view.update(client.Standalone, next);
			expect(contents(view.html())).toEqual(expected);
			expect(contents(other.html())).toEqual(['other|second', 'separate|second', 'other|second']);
		}
	} finally {
		view.unmount();
		other.unmount();
	}
});

it('reads the nearest React provider when the matching native provider is absent', () => {
	const a = createContext('default');
	const b = createContext('default');
	const client = fixture('client');
	const server = fixture('server');
	const container = document.createElement('div');
	const host = createReactRoot(container);
	function tree(compat, { Read, Mixed }, value, context) {
		return h(
			a,
			{ value: 'host' },
			h(
				b,
				{ value: 'outer' },
				h(
					b,
					{ value },
					h(compat, { component: Read, props: { a, b } }),
					h(compat, { component: Mixed, props: { a, b, context, inner: undefined } }),
				),
			),
		);
	}
	try {
		for (const [value, context] of [
			['nearest', a],
			['updated', b],
			['again', a],
		]) {
			const expected = ['host|' + value, context === a ? 'undefined|' + value : 'host|undefined'];
			expect(contents(renderReact(tree(ServerCompat, server, value, context)))).toEqual(expected);
			flushReact(() => host.render(tree(OctaneCompat, client, value, context)));
			expect(contents(container.innerHTML)).toEqual(expected);
		}
	} finally {
		flushReact(() => host.unmount());
	}
});
