import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, hydrateRoot, type Root } from '../../src/runtime.js';
import { renderToString } from '../../src/runtime.server.js';
import { createScope } from '../../src/signals/index.js';
import { loadCompiledFixtureSource } from '../_server-fixture.js';

// A hydrating render reads the server DOM it adopts and writes none of it: what
// the client's values change lands at commit (#2028, #2043). A component that
// renders last takes the mutation records the render has made so far, which
// must be none, although the client's attribute, text and checkedness differ
// from the server's. The text differs only until a render-phase update settles
// it on the server's, so it compares at the end of the pass and stays.

const SOURCE = `
import { useState } from 'octane';

function Probe(props) @{
	props.record();
	<i>{'probe'}</i>
}

export function App(props) @{
	const [label, setLabel] = useState(props.first);
	if (label !== props.settled) setLabel(props.settled);
	<main>
		<div id="attr" title={props.title}>{'x'}</div>
		<p id="text">{label as string}</p>
		<input id="box" type="checkbox" checked={props.checked} />
		<input id="signal-box" type="checkbox" checked={props.live} />
		<Probe record={props.record} />
	</main>
}
`;

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('a hydrating render writes no server DOM ($name)', ({ dev }) => {
	const options = {
		id: `/src/render-writes-nothing-${dev}.tsrx`,
		compileOptions: { opaqueSignalHandles: true, dev, hmr: false },
	};
	const server = loadCompiledFixtureSource(SOURCE, { ...options, mode: 'server' });
	const client = loadCompiledFixtureSource(SOURCE, { ...options, mode: 'client' });
	let container: HTMLElement;
	let root: Root | undefined;
	let owner: ReturnType<typeof createScope> | undefined;

	afterEach(() => {
		root?.unmount();
		root = undefined;
		owner?.dispose();
		owner = undefined;
		container.remove();
		vi.restoreAllMocks();
	});

	it('makes no mutation before its commit, then keeps what React keeps', async () => {
		owner = createScope({ scopeKey: `render-writes-nothing-${dev}` });
		const live = owner.signal$('checked', true);
		const serverProps = {
			title: 'server',
			first: 'server',
			settled: 'server',
			checked: true,
			live,
			record: () => {},
		};
		container = document.createElement('div');
		document.body.append(container);
		container.innerHTML = renderToString(server.App, serverProps, { signalOwner: owner }).html;
		const main = container.querySelector('main')!;
		const attr = container.querySelector('#attr')!;
		const text = container.querySelector('#text')!.firstChild!;
		const box = container.querySelector<HTMLInputElement>('#box')!;
		const signalBox = container.querySelector<HTMLInputElement>('#signal-box')!;
		expect(box.defaultChecked).toBe(true);

		const observer = new MutationObserver(() => {});
		observer.observe(main, {
			subtree: true,
			childList: true,
			attributes: true,
			characterData: true,
		});
		let duringRender = 0;
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		const recoverable: unknown[] = [];
		await act(() => {
			root = hydrateRoot(
				container,
				client.App,
				{
					title: 'client',
					first: 'client',
					settled: 'server',
					checked: false,
					live,
					record: () => (duringRender += observer.takeRecords().length),
				},
				{ signalOwner: owner!, onRecoverableError: (error) => recoverable.push(error) },
			);
		});
		observer.disconnect();

		expect(duringRender).toBe(0);
		expect(recoverable).toEqual([]);
		expect(container.querySelector('main')).toBe(main);
		// The server's attribute stays, as React never patches one; development
		// warns that it won't be patched up.
		expect(attr.getAttribute('title')).toBe('server');
		const unpatched = errors.mock.calls.filter((call) => String(call[0]).includes('patched up'));
		if (dev) {
			expect(unpatched).toHaveLength(1);
			expect(String(unpatched[0][0])).toContain('title');
		} else expect(unpatched).toEqual([]);
		// The text settled on the server's, so the server's Text stays.
		expect(container.querySelector('#text')!.firstChild).toBe(text);
		expect(text.nodeValue).toBe('server');
		// The live checkedness stays, separated from the default, which takes the
		// client's baseline at commit, as React's initInput does.
		expect(container.querySelector('#box')).toBe(box);
		expect(box.checked).toBe(true);
		expect(box.defaultChecked).toBe(false);
		expect(container.querySelector('#signal-box')).toBe(signalBox);
		expect(signalBox.checked).toBe(true);
		await act(() => owner!.set(live, false));
		expect(signalBox.checked).toBe(false);
	});
});
