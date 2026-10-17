import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, hydrateRoot, type Root } from '../../src/runtime.js';
import { renderToString } from '../../src/runtime.server.js';
import * as Signals from '../../src/signals/index.js';
import { createScope } from '../../src/signals/index.js';
import { loadCompiledFixtureSource } from '../_server-fixture.js';

// A server render serializes the values its signal reads presented, so
// hydration presents the server's value and the client's newer value follows
// as an update, as React hydrates a useSyncExternalStore value from
// getServerSnapshot. The render collected only once a native-read module had
// loaded somewhere in the process, so the same page rendered differently in a
// fresh server and in one that had served a module-signal page.

const CHECKBOXES = `export function App(props) @{
	<main>
		<input id="plain" type="checkbox" checked={props.plainChecked} />
		<input id="signal" type="checkbox" checked={props.checked} />
	</main>
}`;

const MODULE_SIGNALS = `import { signal$ } from 'octane/signals';
export const label$ = signal$('module');
export function App() @{ <p>{label$.get() as string}</p> }`;

const compileOptions = { opaqueSignalHandles: true, dev: false, hmr: false };

// React 19.2.7 for the same page, its store read through useSyncExternalStore:
// the store box keeps the server's default, and both follow the client's value.
const REACT = {
	plain: { checked: false, defaultChecked: false },
	signal: { checked: false, defaultChecked: true },
};

describe('a server render of a signal binding', () => {
	const options = { id: '/src/checkbox-snapshot.tsrx', compileOptions };
	const server = loadCompiledFixtureSource(CHECKBOXES, { ...options, mode: 'server' });
	const client = loadCompiledFixtureSource(CHECKBOXES, { ...options, mode: 'client' });
	let root: Root | undefined;

	afterEach(() => {
		root?.unmount();
		root = undefined;
		document.body.textContent = '';
		vi.restoreAllMocks();
	});

	function renderCheckboxes() {
		const owner = createScope({ scopeKey: 'checkbox-snapshot' });
		const checked = owner.signal$('checked', true);
		const html = renderToString(
			server.App,
			{ plainChecked: true, checked },
			{ signalOwner: owner },
		).html;
		return { owner, checked, html };
	}

	async function hydrateCheckboxes(page: ReturnType<typeof renderCheckboxes>) {
		const container = document.createElement('div');
		document.body.append(container);
		container.innerHTML = page.html;
		// The client's value differs from the server's.
		page.owner.set(page.checked, false);
		vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			await act(() => {
				root = hydrateRoot(
					container,
					client.App,
					{ plainChecked: false, checked: page.checked },
					{ signalOwner: page.owner },
				);
			});
			const box = (id: string) => {
				const input = container.querySelector<HTMLInputElement>('#' + id)!;
				return { checked: input.checked, defaultChecked: input.defaultChecked };
			};
			return { plain: box('plain'), signal: box('signal') };
		} finally {
			root?.unmount();
			root = undefined;
			page.owner.dispose();
		}
	}

	it('renders the same HTML whatever the server rendered before, and hydrates like React', async () => {
		// First in this file, so in a server runtime nothing else has used yet.
		const fresh = renderCheckboxes();
		expect(fresh.html).toContain('data-octane-native-signals');
		expect(await hydrateCheckboxes(fresh)).toEqual(REACT);

		// A module-signal page loads its module and renders.
		const runtimeModules = { 'octane/signals': Signals };
		const pageOptions = { id: '/src/module-signal-page.tsrx', compileOptions, runtimeModules };
		const page = loadCompiledFixtureSource(MODULE_SIGNALS, { ...pageOptions, mode: 'server' });
		expect(renderToString(page.App, {}).html).toContain('module');

		const after = renderCheckboxes();
		expect(after.html).toBe(fresh.html);
		expect(await hydrateCheckboxes(after)).toEqual(REACT);
	});

	it('adds no snapshot to a page that reads no signals', () => {
		const owner = createScope({ scopeKey: 'checkbox-scalars' });
		try {
			const html = renderToString(
				server.App,
				{ plainChecked: true, checked: false },
				{ signalOwner: owner },
			).html;
			expect(html).not.toContain('data-octane-native-signals');
		} finally {
			owner.dispose();
		}
	});
});
