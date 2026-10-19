import { describe, expect, it } from 'vitest';
import { act } from './_helpers';
import { loadCompiledFixtureSource } from './_server-fixture';
import { createRoot, flushSync } from '../src/index.js';

// A ViewTransition with scope="element" marks its one host with `vt-scope`.
// The render that adds or drops the scope writes none of the committed host
// (#2043): the marker changes at commit.
const SOURCE = `
import { ViewTransition } from 'octane';
function Probe(props) @{
	props.probe();
	<></>
}
export function App(props) @{
	<main>
		<ViewTransition scope={props.scope}>
			<section id="scoped">{props.text as string}</section>
		</ViewTransition>
		<Probe probe={props.probe} />
	</main>
}
`;

describe.each([false, true])('a ViewTransition scope host (dev=%s)', (dev) => {
	const client = loadCompiledFixtureSource(SOURCE, {
		id: `view-transition-scope-commit-${dev}.tsrx`,
		mode: 'client',
		compileOptions: { dev, hmr: false },
	});

	it('changes its vt-scope marker at commit', async () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		const observer = new MutationObserver(() => {});
		const during: MutationRecord[][] = [];
		let armed = false;
		const probe = () => {
			if (armed) during.push(observer.takeRecords());
		};
		try {
			flushSync(() => root.render(client.App, { scope: 'element', text: 'one', probe }));
			const host = container.querySelector('#scoped')!;
			expect(host.getAttribute('vt-scope')).toBe('element');
			observer.observe(container, {
				subtree: true,
				attributes: true,
				attributeFilter: ['vt-scope'],
			});
			armed = true;
			await act(() => root.render(client.App, { scope: undefined, text: 'two', probe }));
			expect(host.hasAttribute('vt-scope')).toBe(false);
			await act(() => root.render(client.App, { scope: 'element', text: 'three', probe }));
			expect(host.getAttribute('vt-scope')).toBe('element');
			expect(during.length).toBeGreaterThan(1);
			for (const records of during) expect(records).toEqual([]);
			expect(container.querySelector('#scoped')).toBe(host);
		} finally {
			observer.disconnect();
			root.unmount();
			container.remove();
		}
	});

	// The commit queue holds DOM elements beside template bags; an element's own
	// expandos are the application's, whatever their names.
	it.each([300, 3])('commits a host carrying an application `$` of %s untouched', async (mark) => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		const probe = () => {};
		try {
			flushSync(() => root.render(client.App, { scope: 'element', text: 'one', probe }));
			const host = container.querySelector('#scoped') as HTMLElement & { $?: number };
			host.$ = mark;
			await act(() => root.render(client.App, { scope: undefined, text: 'two', probe }));
			expect(host.hasAttribute('vt-scope')).toBe(false);
			expect(host.textContent).toBe('two');
			expect(host.$).toBe(mark);
			await act(() => root.render(client.App, { scope: 'element', text: 'three', probe }));
			expect(host.getAttribute('vt-scope')).toBe('element');
			expect(host.textContent).toBe('three');
			expect(host.$).toBe(mark);
		} finally {
			root.unmount();
			container.remove();
		}
	});
});
