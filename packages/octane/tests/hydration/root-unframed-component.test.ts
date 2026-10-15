import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Client from 'octane';
import * as Server from 'octane/server';

// Octane's server renders a root's returned component in a range of its own,
// which the root's return slot adopts. Markup with the protocol version but no
// such range, which only another server renders, does not match the client
// render: the root renders on the client and reports once.

type Runtime = Pick<typeof Client, 'createElement'>;

function createFixture(runtime: Runtime) {
	function Inner() {
		return runtime.createElement('p', null, 'inner');
	}
	function App() {
		return runtime.createElement(Inner);
	}
	return { App };
}

const client = createFixture(Client);
const server = createFixture(Server as unknown as Runtime);
const MISMATCH = /^Hydration failed because the server rendered HTML didn't match the client\./;

describe("a root's returned component", () => {
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
		vi.restoreAllMocks();
	});

	it("adopts the range Octane's server renders it in", async () => {
		container.innerHTML = Server.renderToString(server.App).html;
		const paragraph = container.querySelector('p')!;
		const onRecoverableError = vi.fn();

		root = Client.hydrateRoot(container, client.App, {}, { onRecoverableError });
		await Client.act(() => {});

		expect(container.querySelector('p')).toBe(paragraph);
		expect(onRecoverableError).not.toHaveBeenCalled();
	});

	it('renders the root on the client over markup that no range bounds', async () => {
		container.innerHTML = '<!--3--><p>inner</p>';
		const paragraph = container.querySelector('p')!;
		const recoverable: string[] = [];

		root = Client.hydrateRoot(
			container,
			client.App,
			{},
			{ onRecoverableError: (error: unknown) => recoverable.push((error as Error).message) },
		);
		await Client.act(() => {});

		expect(container.querySelector('p')!.textContent).toBe('inner');
		expect(paragraph.isConnected).toBe(false);
		expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
	});
});
