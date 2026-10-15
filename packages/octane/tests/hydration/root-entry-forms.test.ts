import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as Client from 'octane';
import * as Server from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// A root renders the same whichever entry form names it: the component with its
// props, or an element of it, as React's `renderToString(<App />)` and
// `hydrateRoot(container, <App />)` are. Every server entry hydrates through
// every client entry, adopting the server DOM with nothing to report, whatever
// the root component returns.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/root-entry-forms.tsrx',
);
const FILE = 'root-entry-forms.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');

const APPS = [
	{ name: 'HostApp', returns: 'host JSX', text: 'x' },
	{ name: 'TemplateApp', returns: 'a template', text: 'x' },
	{ name: 'ComponentApp', returns: 'a component', text: 'x' },
	{ name: 'FragmentApp', returns: 'a fragment', text: 'xb' },
	{ name: 'TextApp', returns: 'text', text: 'x' },
	{ name: 'NullApp', returns: 'null', text: '' },
	{ name: 'SuspenseApp', returns: 'a Suspense boundary', text: 'x' },
	{ name: 'ChildrenApp', returns: 'its children', text: 'xkid' },
];

type Entry = 'component' | 'element';

/** The props each app renders with, the children among them. */
function propsOf(name: string): Record<string, unknown> {
	return name === 'ChildrenApp' ? { label: 'x', children: 'kid' } : { label: 'x' };
}

async function serverHtml(server: Record<string, any>, name: string, render: string, entry: Entry) {
	const App = server[name];
	const props = propsOf(name);
	const node = entry === 'component' ? App : Server.createElement(App, props);
	if (render === 'renderToString')
		return (entry === 'component' ? Server.renderToString(App, props) : Server.renderToString(node))
			.html;
	const stream = await (entry === 'component'
		? Server.renderToReadableStream(App, props)
		: Server.renderToReadableStream(node));
	await stream.allReady;
	return new Response(stream).text();
}

const PAIRS = APPS.flatMap((app) =>
	['renderToString', 'renderToReadableStream'].flatMap((render) =>
		(['component', 'element'] as const).flatMap((serverEntry) =>
			(['component', 'element'] as const).map((clientEntry) => ({
				...app,
				render,
				serverEntry,
				clientEntry,
			})),
		),
	),
);

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — every root entry form ($name)', ({ dev }) => {
	const server = loadServerFixture(FIXTURE, { id: FILE });
	const client = loadCompiledFixtureSource(SOURCE, {
		id: FILE,
		mode: 'client',
		compileOptions: { dev },
	});
	let container: HTMLElement;
	let root: Client.Root | undefined;
	let errSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		root?.unmount();
		root = undefined;
		container.remove();
		errSpy.mockRestore();
	});

	it.each(PAIRS)(
		'adopts $returns from $render($serverEntry) through hydrateRoot($clientEntry)',
		async ({ name, text, render, serverEntry, clientEntry }) => {
			container.innerHTML = await serverHtml(server, name, render, serverEntry);
			const served = [...container.querySelectorAll('*')];
			const recoverable: unknown[] = [];
			const options = { onRecoverableError: (error: unknown) => recoverable.push(error) };
			const App = client[name];
			const props = propsOf(name);

			root =
				clientEntry === 'component'
					? Client.hydrateRoot(container, App, props, options)
					: Client.hydrateRoot(container, Client.createElement(App, props), options);
			await Client.act(() => {});

			expect(container.textContent).toBe(text);
			expect(served.filter((node) => !node.isConnected)).toEqual([]);
			expect(recoverable).toEqual([]);
			expect(
				errSpy.mock.calls
					.map((call: unknown[]) => String(call[0]))
					.filter((m: string) => m.includes('hydration')),
			).toEqual([]);
		},
	);
});
