import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRoot, hydrateRoot, flushSync } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource } from '../_server-fixture';

// Prettier inserts `{" "}` to keep a space between text and an inline tag.
// That expression is a static string. If the .tsx client treats it as a hole
// while the server folds it, hydration consumes the following component node
// and remounts a duplicate (e.g. `itemsitems`).

const PRETTIER_SPACE = `
	function Link(props) {
		return <a href={props.to}>{props.children}</a>;
	}
	export function Example() {
		return (
			<p>
				Try the{" "}
				<Link to="/items">items</Link> page
			</p>
		);
	}
`;

const SPACE_BETWEEN_COMPONENTS = `
	function Link(props) {
		return <a href={props.to}>{props.children}</a>;
	}
	export function Example() {
		return (
			<p>
				<Link to="/a">alpha</Link>
				{" "}
				<Link to="/b">beta</Link>
			</p>
		);
	}
`;

const LITERAL_AND_DYNAMIC = `
	function Emph(props) {
		return <em>{props.children}</em>;
	}
	export function Example(props) {
		return (
			<p>
				Hello{" "}
				<Emph>{props.label as string}</Emph>
				{"-"}world
			</p>
		);
	}
`;

const compileOptions = { hmr: false, dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' };

function loadPair(source: string, id: string): { client: any; server: any } {
	return {
		client: loadCompiledFixtureSource(source, { id, mode: 'client', compileOptions }),
		server: loadCompiledFixtureSource(source, { id, mode: 'server', compileOptions }),
	};
}

describe('hydrateRoot — .tsx string-literal expression children', function () {
	let container: HTMLElement;
	beforeEach(function () {
		container = document.createElement('div');
		document.body.appendChild(container);
	});
	afterEach(function () {
		container.remove();
	});

	it('hydrates Prettier {" "} before an inline component without duplicating it', function () {
		const { client, server } = loadPair(PRETTIER_SPACE, 'prettier-space.tsx');
		const { html } = ServerRT.renderToString(server.Example);
		expect(html).toContain('Try the ');
		expect(html).toContain('items');
		container.innerHTML = html;
		const paragraph = container.querySelector('p') as HTMLParagraphElement;
		const link = container.querySelector('a') as HTMLAnchorElement;
		expect(container.querySelectorAll('a').length).toBe(1);
		expect(paragraph.textContent).toBe('Try the items page');

		const root = hydrateRoot(container, client.Example);
		try {
			flushSync(function () {});
			expect(container.querySelector('p')).toBe(paragraph);
			expect(container.querySelector('a')).toBe(link);
			expect(container.querySelectorAll('a').length).toBe(1);
			expect(paragraph.textContent).toBe('Try the items page');
			expect(link.getAttribute('href')).toBe('/items');
		} finally {
			root.unmount();
		}
	});

	it('client-only mount of the Prettier pattern matches SSR text', function () {
		const { client, server } = loadPair(PRETTIER_SPACE, 'prettier-space-client.tsx');
		const { html } = ServerRT.renderToString(server.Example);
		const root = createRoot(container);
		try {
			flushSync(function () {
				root.render(client.Example);
			});
			expect(container.querySelectorAll('a').length).toBe(1);
			expect(container.querySelector('p')!.textContent).toBe('Try the items page');
			expect(container.querySelector('p')!.innerHTML.replace(/<!--[^>]*-->/g, '')).toBe(
				html
					.replace(/^<p>/, '')
					.replace(/<\/p>$/, '')
					.replace(/<!--[^>]*-->/g, ''),
			);
		} finally {
			root.unmount();
		}
	});

	it('hydrates a string literal between two components without duplicating either', function () {
		const { client, server } = loadPair(SPACE_BETWEEN_COMPONENTS, 'space-between.tsx');
		const { html } = ServerRT.renderToString(server.Example);
		container.innerHTML = html;
		const links = Array.from(container.querySelectorAll('a'));
		expect(links).toHaveLength(2);
		expect(container.querySelector('p')!.textContent).toBe('alpha beta');

		const root = hydrateRoot(container, client.Example);
		try {
			flushSync(function () {});
			const after = Array.from(container.querySelectorAll('a'));
			expect(after).toHaveLength(2);
			expect(after[0]).toBe(links[0]);
			expect(after[1]).toBe(links[1]);
			expect(container.querySelector('p')!.textContent).toBe('alpha beta');
		} finally {
			root.unmount();
		}
	});

	it('hydrates mixed static literals around a dynamic component child', function () {
		const { client, server } = loadPair(LITERAL_AND_DYNAMIC, 'literal-and-dynamic.tsx');
		const props = { label: 'there' };
		const { html } = ServerRT.renderToString(server.Example, props);
		container.innerHTML = html;
		const emph = container.querySelector('em') as HTMLElement;
		expect(container.querySelector('p')!.textContent).toBe('Hello there-world');

		const root = hydrateRoot(container, client.Example, props);
		try {
			flushSync(function () {});
			expect(container.querySelector('em')).toBe(emph);
			expect(container.querySelectorAll('em').length).toBe(1);
			expect(container.querySelector('p')!.textContent).toBe('Hello there-world');
		} finally {
			root.unmount();
		}
	});
});
