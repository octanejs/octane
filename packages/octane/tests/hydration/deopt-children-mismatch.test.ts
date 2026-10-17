import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Client from 'octane';
import * as Server from 'octane/server';
import { loadCompiledFixtureSource } from '../_server-fixture.js';

// A pure-host descriptor's children are reconciled as raw DOM by the client's
// de-opt reconciler. Where the server rendered a child the client renders
// nothing for, or none where the client renders one, the server HTML does not
// match: as in React, the root renders on the client and reports once.

const SOURCE = `import { createElement } from 'octane';

export function List(props: { items: string[] }) @{
	<main>
		{createElement('ul', null, ...props.items.map((item) => createElement('li', null, item)))}
	</main>
}
`;
const FILE = 'deopt-children-mismatch.tsrx';
const MISMATCH = /^Hydration failed because the server rendered HTML didn't match the client\./;

describe.each([true, false])(
	'hydrateRoot — de-opt children that differ (dev compile: %s)',
	(dev) => {
		const server = loadCompiledFixtureSource(SOURCE, {
			id: FILE,
			mode: 'server',
			compileOptions: { mode: 'server' },
		});
		const client = loadCompiledFixtureSource(SOURCE, {
			id: FILE,
			mode: 'client',
			compileOptions: { dev },
		});
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

		it.each([
			{
				difference: 'more',
				serverItems: ['a', 'b'],
				clientItems: ['a'],
				expected: 'the end of <ul>',
				rendered: '<li>',
			},
			{
				difference: 'fewer',
				serverItems: ['a'],
				clientItems: ['a', 'b'],
				expected: '<li>',
				rendered: 'nothing',
			},
		])(
			'renders the root on the client when the server rendered $difference children',
			async ({ serverItems, clientItems, expected, rendered }) => {
				container.innerHTML = Server.renderToString(server.List, { items: serverItems }).html;
				const serverList = container.querySelector('ul')!;
				const error = vi.spyOn(console, 'error').mockImplementation(() => {});
				const recoverable: string[] = [];

				root = Client.hydrateRoot(
					container,
					client.List,
					{ items: clientItems },
					{ onRecoverableError: (e: unknown) => recoverable.push((e as Error).message) },
				);
				await Client.act(() => {});

				expect(serverList.isConnected).toBe(false);
				expect(container.querySelector('ul')!.innerHTML).toBe(
					clientItems.map((item) => `<li>${item}</li>`).join(''),
				);
				expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
				const warnings = error.mock.calls
					.map((call) => String(call[0]))
					.filter((message) => message.includes('hydration mismatch'));
				expect(warnings).toEqual(
					dev
						? [
								expect.stringContaining(
									`the client expected ${expected} but the server rendered ${rendered}.`,
								),
							]
						: [],
				);
			},
		);
	},
);
