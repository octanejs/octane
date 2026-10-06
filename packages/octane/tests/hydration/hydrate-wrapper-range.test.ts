import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Client from 'octane';
import { load } from 'octane/hydration';
import * as Server from 'octane/server';
import { flushEffects } from '../_helpers.js';
import { loadCompiledFixtureSource } from '../_server-fixture.js';

// The server renders a plain <div> where the client renders a Hydrate island,
// as a server/client branch would: the island adopts the <div> as its wrapper,
// which has none of the boundary's server range. React 19.2.7 (hydration
// oracle): a <Suspense> where the server rendered a <div> fails the hydration
// of the enclosing boundary, or else the root, which renders on the client and
// reports one recoverable error.

type Runtime = Pick<typeof Client, 'createElement' | 'Fragment' | 'Hydrate' | 'Suspense'>;

// Public createElement components exercise the island without a compiled
// template.
function createFixture(runtime: Runtime) {
	function Island(props: { side: string }) {
		return props.side === 'client'
			? runtime.createElement(runtime.Hydrate, {
					when: load(),
					children: runtime.createElement('p', null, 'client'),
				})
			: runtime.createElement('div', null, runtime.createElement('p', null, 'server'));
	}

	function App(props: { side: string }) {
		return runtime.createElement(
			'main',
			null,
			runtime.createElement('h1', null, 'title'),
			runtime.createElement(Island, props),
		);
	}

	function BoundaryApp(props: { side: string }) {
		return runtime.createElement(
			'main',
			null,
			runtime.createElement('h1', null, 'title'),
			runtime.createElement(runtime.Suspense, {
				fallback: null,
				children: runtime.createElement(
					runtime.Fragment,
					null,
					runtime.createElement('span', null, 'outer'),
					runtime.createElement(Island, props),
				),
			}),
		);
	}

	return { App, BoundaryApp };
}

const client = createFixture(Client);
const server = createFixture(Server as unknown as Runtime);

const SOURCE = `import { Hydrate } from 'octane';
import { load } from 'octane/hydration';

function Island(props: { side: string }) {
	return props.side === 'client'
		? <Hydrate split={false} when={load()}><p>{'client'}</p></Hydrate>
		: <div><p>{'server'}</p></div>;
}

export function App(props: { side: string }) @{
	<main>
		<h1>{'title'}</h1>
		<Island side={props.side} />
	</main>
}
`;
const FILE = 'hydrate-wrapper-range.tsrx';

describe('a Hydrate wrapper without its server range', () => {
	let container: HTMLElement;
	let root: Client.Root | undefined;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
	});

	afterEach(() => {
		root?.unmount();
		root = undefined;
		container.remove();
		flushEffects();
		vi.restoreAllMocks();
	});

	it('fails the root, which renders on the client and reports once', async () => {
		container.innerHTML = Server.renderToString(server.App, { side: 'server' }).html;
		const heading = container.querySelector('h1')!;
		const serverParagraph = container.querySelector('p')!;
		const onRecoverableError = vi.fn();

		root = Client.hydrateRoot(container, client.App, { side: 'client' }, { onRecoverableError });
		await Client.act(() => {});

		expect(container.querySelector('main')!.textContent).toBe('titleclient');
		expect(serverParagraph.isConnected).toBe(false);
		// The root's client render replaces every server node.
		expect(heading.isConnected).toBe(false);
		expect(onRecoverableError).toHaveBeenCalledOnce();
	});

	it('fails the enclosing Suspense boundary, which renders on the client and reports once', async () => {
		container.innerHTML = Server.renderToString(server.BoundaryApp, { side: 'server' }).html;
		const heading = container.querySelector('h1')!;
		const outer = container.querySelector('span')!;
		const serverParagraph = container.querySelector('p')!;
		const onRecoverableError = vi.fn();

		root = Client.hydrateRoot(
			container,
			client.BoundaryApp,
			{ side: 'client' },
			{ onRecoverableError },
		);
		await Client.act(() => {});

		expect(container.querySelector('main')!.textContent).toBe('titleouterclient');
		expect(serverParagraph.isConnected).toBe(false);
		// Only the boundary's server content is discarded.
		expect(container.querySelector('h1')).toBe(heading);
		expect(outer.isConnected).toBe(false);
		expect(onRecoverableError).toHaveBeenCalledOnce();
	});

	it.each([true, false])(
		'names the component that renders the island in its diagnostic (dev compile: %s)',
		async (dev) => {
			const compiledServer = loadCompiledFixtureSource(SOURCE, {
				id: FILE,
				mode: 'server',
				compileOptions: { mode: 'server' },
			});
			const compiledClient = loadCompiledFixtureSource(SOURCE, {
				id: FILE,
				mode: 'client',
				compileOptions: { dev },
			});
			container.innerHTML = Server.renderToString(compiledServer.App, { side: 'server' }).html;
			const heading = container.querySelector('h1')!;
			const error = vi.spyOn(console, 'error').mockImplementation(() => {});
			const onRecoverableError = vi.fn();

			root = Client.hydrateRoot(
				container,
				compiledClient.App,
				{ side: 'client' },
				{ onRecoverableError },
			);
			await Client.act(() => {});

			expect(container.querySelector('main')!.textContent).toBe('titleclient');
			expect(heading.isConnected).toBe(false);
			expect(onRecoverableError).toHaveBeenCalledOnce();
			const structural = error.mock.calls
				.map((call) => String(call[0]))
				.filter((message) => message.includes('hydration mismatch'));
			expect(structural).toEqual(
				dev
					? [
							expect.stringMatching(
								new RegExp(
									`^Octane hydration mismatch at ${FILE}:\\d+:\\d+: the client expected a ` +
										`Hydrate boundary range but the server rendered <p>`,
								),
							),
						]
					: [],
			);
		},
	);
});
