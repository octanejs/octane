import { describe, expect, it } from 'vitest';
import { act } from './_helpers';
import { loadCompiledFixtureSource } from './_server-fixture';
import { createRoot, flushSync, startTransition } from '../src/index.js';

// A root's first render builds off-document: its container keeps what it
// showed until the mount commits, whether the mount commits as root.render
// returns or with a later commit (#2043).
const SOURCE = `
import { useLayoutEffect } from 'octane';
function Probe(props) @{
	props.probe();
	<></>
}
export function App(props) @{
	<section id="mounted">
		<b>{props.label as string}</b>
		<Probe probe={props.probe} />
	</section>
}
export function Outer(props) @{
	useLayoutEffect(() => {
		props.mountInner();
	}, []);
	<p id="outer">{'outer'}</p>
}
`;

function observe(target: Node) {
	const observer = new MutationObserver(() => {});
	observer.observe(target, {
		subtree: true,
		childList: true,
		characterData: true,
		attributes: true,
	});
	return observer;
}

describe.each([false, true])('a root mount (dev=%s)', (dev) => {
	const client = () =>
		loadCompiledFixtureSource(SOURCE, {
			id: `root-mount-commit-${dev}.tsrx`,
			mode: 'client',
			compileOptions: { dev, hmr: false },
		});

	it('leaves its container alone while a transition mount renders', async () => {
		const c = client();
		const container = document.createElement('div');
		container.innerHTML = '<span id="before">before</span>';
		document.body.appendChild(container);
		const before = container.firstChild;
		const observer = observe(container);
		const during: MutationRecord[][] = [];
		const root = createRoot(container);
		try {
			startTransition(() =>
				root.render(c.App, { label: 'ready', probe: () => during.push(observer.takeRecords()) }),
			);
			// The render is queued; nothing has rendered yet.
			expect(during).toEqual([]);
			observer.takeRecords();
			await act(() => {});
			expect(during.length).toBeGreaterThan(0);
			for (const records of during) expect(records).toEqual([]);
			expect(before!.parentNode).toBeNull();
			expect(container.querySelector('#mounted b')!.textContent).toBe('ready');
		} finally {
			observer.disconnect();
			root.unmount();
			container.remove();
		}
	});

	it('leaves its container alone while a mount from a commit callback renders', () => {
		const c = client();
		const outerContainer = document.createElement('div');
		const container = document.createElement('div');
		container.innerHTML = '<span id="before">before</span>';
		document.body.append(outerContainer, container);
		const observer = observe(container);
		const during: MutationRecord[][] = [];
		const inner = createRoot(container);
		const outer = createRoot(outerContainer);
		try {
			flushSync(() =>
				outer.render(c.Outer, {
					mountInner: () =>
						inner.render(c.App, {
							label: 'inner',
							probe: () => during.push(observer.takeRecords()),
						}),
				}),
			);
			flushSync(() => {});
			expect(during.length).toBeGreaterThan(0);
			for (const records of during) expect(records).toEqual([]);
			expect(container.querySelector('#mounted b')!.textContent).toBe('inner');
			expect(container.querySelector('#before')).toBeNull();
		} finally {
			observer.disconnect();
			inner.unmount();
			outer.unmount();
			outerContainer.remove();
			container.remove();
		}
	});
});
