import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import { condition, load } from 'octane/hydration';
import { renderToString } from 'octane/server';
import { loadCompiledFixtureSource } from '../_server-fixture';

// An update that reaches a dormant island hydrates it first, with the captures
// the server rendered, then applies itself to what the island adopted (#2043).
// The update's render writes none of that server DOM: what it builds there
// lands at commit.
const SOURCE = `
import { Hydrate, createElement } from 'octane';
function Leaf(props) @{
	<em>{props.v}</em>
}
function Probe(props) @{
	if (props.probe) props.probe();
	<></>
}
export function Dormant(props) @{
	const el = createElement(
		'div',
		{ id: 'host' },
		props.server ? 'hello' : createElement('span', null, createElement(Leaf, { v: props.v })),
	);
	<main>
		<Hydrate when={props.when} split={false}>
			<section>
				<Probe probe={props.reset} />
				{el}
				<p>{props.v as string}</p>
				<Probe probe={props.probe} />
			</section>
		</Hydrate>
	</main>
}
`;

describe.each([false, true])('an update that hydrates a dormant island (dev=%s)', (dev) => {
	const options = (mode: 'client' | 'server') => ({
		id: `island-update-off-document-${dev}.tsrx`,
		mode,
		compileOptions: { dev, hmr: false },
	});
	const client = loadCompiledFixtureSource(SOURCE, options('client'));
	const server = loadCompiledFixtureSource(SOURCE, options('server'));
	let done: (() => void) | null = null;
	afterEach(() => {
		done?.();
		done = null;
	});

	it('builds what it changes in the adopted DOM off-document', async () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const serverProps = { when: condition(false), server: true, v: 'server' };
		container.innerHTML = renderToString(server.Dormant, serverProps).html;
		const host = container.querySelector('#host')!;
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = hydrateRoot(container, client.Dormant, serverProps, {
			onRecoverableError: () => {},
		});
		const observer = new MutationObserver(() => {});
		done = () => {
			observer.disconnect();
			root.unmount();
			container.remove();
			consoleError.mockRestore();
		};
		flushSync(() => {});
		observer.observe(container, {
			subtree: true,
			childList: true,
			characterData: true,
			attributes: true,
		});
		// The update's render starts at the first probe: what activated the island
		// before it is the island's own.
		const during: MutationRecord[][] = [];
		const reset = () => observer.takeRecords();
		const probe = () => during.push(observer.takeRecords());
		await act(() =>
			root.render(client.Dormant, { when: load(), server: false, v: 'client', reset, probe }),
		);
		expect(during.length).toBeGreaterThan(0);
		for (const records of during) expect(records).toEqual([]);
		expect(container.querySelector('#host')).toBe(host);
		expect(host.querySelector('em')!.textContent).toBe('client');
		expect(container.querySelector('p')!.textContent).toBe('client');
	});
});
