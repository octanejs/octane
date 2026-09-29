import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'octane/server';
import { createRoot, flushSync, hydrateRoot } from '../../src/index.js';
import { loadCompiledFixtureSource } from '../_server-fixture.js';

// A component can return a host that the compiler builds imperatively rather
// than from a template: an explicitly keyed host, `<noscript>`, or a document
// element. Hydration must adopt that host exactly as it adopts the same host
// written in a `@{}` body, and later renders must update, replace, or remove
// it without leaving the old element behind.

const mode = process.env.OCTANE_TEST_COMPILE_MODE === 'prod' ? 'prod' : 'dev';

function load(source: string, server: boolean) {
	return loadCompiledFixtureSource(source, {
		id: 'returned-host-root.tsrx',
		mode: server ? 'server' : 'client',
		compileOptions: { dev: mode === 'dev', hmr: false },
	}).App;
}

const cleanups: (() => void)[] = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

interface Session {
	render(props: Record<string, unknown>): void;
	unmount(): void;
	recovered: unknown[];
	/** Everything printed to console.error during the session. */
	messages(): string[];
}

/** Renders `source` into `container`, hydrating its server output if asked. */
function start(
	kind: 'mount' | 'hydrate',
	container: Element | Document,
	source: string,
	props: Record<string, unknown>,
): Session {
	const error = vi.spyOn(console, 'error').mockImplementation(() => {});
	cleanups.push(() => error.mockRestore());
	const App = load(source, false);
	const recovered: unknown[] = [];
	const root =
		kind === 'hydrate'
			? hydrateRoot(container as Element, App, props, {
					onRecoverableError: (e) => recovered.push(e),
				})
			: createRoot(container as Element);
	if (kind === 'mount') flushSync(() => root.render(App, props));
	flushSync(() => {});
	return {
		render: (next) => flushSync(() => root.render(App, next)),
		unmount: () => root.unmount(),
		recovered,
		messages: () => error.mock.calls.map((call) => String(call[0])),
	};
}

/** A connected container holding the server HTML when hydrating. */
function listContainer(kind: 'mount' | 'hydrate', source: string, props: Record<string, unknown>) {
	const container = document.createElement('div');
	if (kind === 'hydrate') container.innerHTML = renderToString(load(source, true), props).html;
	document.body.append(container);
	cleanups.push(() => container.remove());
	return container;
}

function serverDocument(source: string, props: Record<string, unknown>) {
	const { html } = renderToString(load(source, true), props);
	return new DOMParser().parseFromString('<!DOCTYPE html>' + html, 'text/html');
}

const list = (row: string, call = '<Row id={id}/>') => `${row}
	export function App({id, label}) @{ <div class="list"><i>head</i>${call}<span>tail</span></div> }`;

/** Content nodes between the list's static `<i>` head and `<span>` tail. */
function between(container: Element): ChildNode[] {
	const nodes: ChildNode[] = [];
	const tail = container.querySelector('.list > span');
	for (let node = container.querySelector('.list > i')!.nextSibling; node !== tail;) {
		if (node!.nodeType !== Node.COMMENT_NODE) nodes.push(node!);
		node = node!.nextSibling;
	}
	return nodes;
}

const text = (nodes: ChildNode[]) => nodes.map((node) => node.textContent);

interface Shape {
	source: string;
	/** Whether a changed `id` must replace the element rather than patch it. */
	keyed: boolean;
}

const shapes: Record<string, Shape> = {
	'a keyed host': {
		source: list(`function Row({id}) { return <p key={id} class="row">{String(id)}</p>; }`),
		keyed: true,
	},
	'a keyed host with a component child': {
		source: list(`function Leaf({id}) @{ <b>{String(id)}</b> }
			function Row({id}) { return <p key={id} class="row"><Leaf id={id}/></p>; }`),
		keyed: true,
	},
	'a noscript host': {
		source: list(`function Row({id}) { return <noscript class="row">{String(id)}</noscript>; }`),
		keyed: false,
	},
	'a keyed host from a direct call': {
		source: list(`function Keyed({id}) { return <p key={id} class="row">{String(id)}</p>; }
			function Row({id}) @{ <>{Keyed({id})}</> }`),
		keyed: true,
	},
	// Controls: the same host from a `@{}` body, and a template host return.
	'a keyed host in a JSX code block': {
		source: list(`function Row({id}) @{ <p key={id} class="row">{String(id)}</p> }`),
		keyed: true,
	},
	'a template host': {
		source: list(`function Row({id}) { return <p class="row">{String(id)}</p>; }`),
		keyed: false,
	},
};

describe('a component that returns a host built outside a template', () => {
	describe.each(['mount', 'hydrate'] as const)('%s', (kind) => {
		it.each(Object.entries(shapes))('renders and updates %s', async (_name, { source, keyed }) => {
			const container = listContainer(kind, source, { id: 0 });
			const server = kind === 'hydrate' ? between(container) : [];
			const s = start(kind, container, source, { id: 0 });
			const initial = between(container);
			expect(text(initial)).toEqual(['0']);
			if (kind === 'hydrate') expect(initial[0]).toBe(server[0]);

			s.render({ id: 1 });
			const updated = between(container);
			expect(text(updated)).toEqual(['1']);
			expect(updated[0] === initial[0]).toBe(!keyed);
			if (keyed) expect(initial[0].isConnected).toBe(false);

			s.unmount();
			expect(container.innerHTML).toBe('');
			await Promise.resolve();
			expect(s.recovered).toEqual([]);
			expect(s.messages()).toEqual([]);
		});

		it('switches between a returned keyed host and text', async () => {
			const source = list(
				`function Row({id, label}) {
					if (label) return label;
					return <p key={id} class="row">{String(id)}</p>;
				}`,
				'<Row id={id} label={label}/>',
			);
			const container = listContainer(kind, source, { id: 0, label: '' });
			const s = start(kind, container, source, { id: 0, label: '' });
			expect(text(between(container))).toEqual(['0']);

			s.render({ id: 0, label: 'text' });
			expect(text(between(container))).toEqual(['text']);
			s.render({ id: 1, label: '' });
			expect(text(between(container))).toEqual(['1']);
			s.render({ id: 1, label: 'again' });
			expect(text(between(container))).toEqual(['again']);

			await Promise.resolve();
			expect(s.recovered).toEqual([]);
			expect(s.messages()).toEqual([]);
		});

		it('renders a returned body inside a document', async () => {
			const source = `function Body({label}) { return <body><button>{label as string}</button></body>; }
				export function App({label}) @{ <html lang="en"><head/><Body label={label}/></html> }`;
			const doc =
				kind === 'hydrate'
					? serverDocument(source, { label: 'first' })
					: document.implementation.createHTMLDocument('client');
			const serverButton = doc.querySelector('button');
			const s = start(kind, doc, source, { label: 'first' });
			expect(doc.querySelectorAll('body')).toHaveLength(1);
			const button = doc.querySelector('button')!;
			if (kind === 'hydrate') expect(button).toBe(serverButton);

			s.render({ label: 'second' });
			expect(doc.querySelectorAll('body')).toHaveLength(1);
			expect(doc.querySelector('button')).toBe(button);
			expect(button.textContent).toBe('second');

			s.unmount();
			await Promise.resolve();
			expect(s.recovered).toEqual([]);
			expect(s.messages()).toEqual([]);
		});

		it('renders a returned document root', async () => {
			const source = `export function App({label}) {
				return <html lang="en"><head/><body><button>{label as string}</button></body></html>;
			}`;
			const doc =
				kind === 'hydrate'
					? serverDocument(source, { label: 'first' })
					: document.implementation.createHTMLDocument('client');
			const serverRoot = doc.documentElement;
			const s = start(kind, doc, source, { label: 'first' });
			const button = doc.querySelector('button')!;
			if (kind === 'hydrate') expect(doc.documentElement).toBe(serverRoot);
			expect(button.textContent).toBe('first');

			s.render({ label: 'second' });
			expect(doc.querySelector('button')).toBe(button);
			expect(button.textContent).toBe('second');

			s.unmount();
			await Promise.resolve();
			expect(s.recovered).toEqual([]);
			expect(s.messages()).toEqual([]);
		});
	});
});
