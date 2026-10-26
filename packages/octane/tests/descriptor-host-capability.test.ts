import { afterEach, describe, expect, it, vi } from 'vitest';

// Only code that can build a host element descriptor installs the host
// descriptor renderer, so a bundle that never builds one does not retain it.
// Each case loads a fresh runtime: its host descriptor is the first that
// runtime renders, and no earlier case can have installed the renderer.
const containers: HTMLElement[] = [];
afterEach(() => {
	for (const container of containers.splice(0)) container.remove();
});

// A custom receiver's map runs the authored callback, so its rows are descriptors.
class Rows {
	constructor(readonly items: string[]) {}
	map<T>(callback: (item: string) => T): T[] {
		return this.items.map(callback);
	}
}

const cases = [
	{
		name: 'a compiled tag that resolves to a host string at runtime',
		id: 'host-capability-dynamic.tsx',
		source: `export function App(props: { tag: any; label: string }) {
			const Tag = props.tag;
			return <Tag id="host" title={props.label} />;
		}`,
		props: (label: string) => ({ tag: 'h2', label }),
		selector: 'h2#host',
		read: (host: Element) => host.getAttribute('title'),
	},
	{
		name: "scoped host elements in a custom receiver's mapped rows",
		id: 'host-capability-scoped-rows.tsx',
		source: `export function App(props: { rows: { map<T>(fn: (row: string) => T): T[] } }) {
			return <ul>{props.rows.map((row) => <li key={row}><b id="host">{row}</b></li>)}</ul>;
		}`,
		props: (label: string) => ({ rows: new Rows([label]) }),
		selector: 'li > b#host',
		read: (host: Element) => host.textContent,
	},
	{
		name: "static host elements in a custom receiver's mapped rows",
		id: 'host-capability-static-rows.tsx',
		source: `export function App(props: { rows: { map<T>(fn: (row: string) => T): T[] } }) {
			return <ul>{props.rows.map((row) => <li key="row" id="host" title={row}><b>{'x'}</b></li>)}</ul>;
		}`,
		props: (label: string) => ({ rows: new Rows([label]) }),
		selector: 'li#host',
		read: (host: Element) => host.getAttribute('title'),
	},
	{
		name: 'a dynamic component tag that resolves to a host string',
		id: 'host-capability-as.tsrx',
		source: `export function App(props: { as: string; label: string }) @{
			<props.as id="host">{props.label as string}</props.as>
		}`,
		props: (label: string) => ({ as: 'em', label }),
		selector: 'em#host',
		read: (host: Element) => host.textContent,
	},
];

describe('host descriptor renderer capability', () => {
	it.each(cases)(
		'renders $name in a fresh runtime',
		async ({ id, source, props, selector, read }) => {
			vi.resetModules();
			const { createRoot, flushSync } = await import('../src/index.js');
			const { loadCompiledFixtureSource } = await import('./_server-fixture.js');
			const { App } = loadCompiledFixtureSource(source, {
				id,
				mode: 'client',
				compileOptions: { dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod', hmr: false },
			});
			const container = document.createElement('div');
			document.body.append(container);
			containers.push(container);
			const root = createRoot(container);
			flushSync(() => root.render(App, props('first')));
			const host = container.querySelector(selector);
			expect(host).not.toBeNull();
			expect(read(host!)).toBe('first');
			flushSync(() => root.render(App, props('first')));
			expect(container.querySelector(selector)).toBe(host);
			root.unmount();
			expect(container.childNodes.length).toBe(0);
		},
	);

	it('renders a public createElement host in a fresh runtime', async () => {
		vi.resetModules();
		const { createElement, createRoot, flushSync } = await import('../src/index.js');
		const container = document.createElement('div');
		document.body.append(container);
		containers.push(container);
		const root = createRoot(container);
		flushSync(() => root.render(createElement('p', { id: 'host' }, 'first')));
		expect(container.querySelector('p#host')?.textContent).toBe('first');
		root.unmount();
	});
});
