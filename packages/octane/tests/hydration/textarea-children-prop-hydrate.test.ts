import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { act, createRoot, flushSync, hydrateRoot, type Root } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import * as Signals from '../../src/signals/index.js';
import { runWithSignalOwner } from '../../src/signals/index.js';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';
import {
	ChildrenAttr,
	ChildrenAttrCascade,
	ChildrenAttrSpread,
	ChildrenProp,
	SpreadChildren,
} from './_fixtures/textarea-children-prop.tsrx';

// A `children` prop held by a spread or written as `children=` renders through
// the same live text binding as authored textarea children. React's
// updateTextarea resets defaultValue to '' on each update without a
// value/defaultValue writer, because its children only seed the initial value.
// Applying that reset here detached the binding's Text node, so every later
// update wrote into a node outside the textarea and the field went empty.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/textarea-children-prop.tsrx',
);
const server = loadServerFixture(FIXTURE, {
	id: 'textarea-children-prop.tsrx',
	compileOptions: { dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' },
});

const containers: HTMLElement[] = [];
afterEach(() => {
	for (const container of containers.splice(0)) container.remove();
	vi.restoreAllMocks();
});

// The React-parity DEV authoring warning for textarea children is not a
// hydration report; it fires for a client-only mount too.
const isTextareaChildrenWarning = (call: unknown[]) =>
	String(call[0]).includes('instead of children on <textarea>');

function createContainer() {
	const container = document.createElement('div');
	document.body.appendChild(container);
	containers.push(container);
	return container;
}

type Mounted = {
	container: HTMLElement;
	update: (props: Record<string, unknown>) => void;
	unmount: () => void;
	reports: () => unknown[][];
};

function mountClient(component: any, props: Record<string, unknown>): Mounted {
	const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
	const container = createContainer();
	const root = createRoot(container);
	flushSync(() => root.render(component, props));
	return {
		container,
		update: (next) => flushSync(() => root.render(component, next)),
		unmount: () => root.unmount(),
		reports: () => errors.mock.calls.filter((call) => !isTextareaChildrenWarning(call)),
	};
}

async function mountHydrated(
	name: string,
	component: any,
	props: Record<string, unknown>,
): Promise<Mounted> {
	const container = createContainer();
	container.innerHTML = ServerRT.renderToString(server[name], props).html;
	const textarea = container.querySelector('textarea')!;
	const serverDefault = textarea.defaultValue;

	const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
	const recoverable: unknown[] = [];
	const root = hydrateRoot(container, component, props, {
		onRecoverableError: (error) => recoverable.push(error),
	});
	await act(() => {});
	expect(recoverable).toEqual([]);
	expect(container.querySelector('textarea')).toBe(textarea);
	expect(textarea.defaultValue).toBe(serverDefault);
	return {
		container,
		update: (next) => flushSync(() => root.render(component, next)),
		unmount: () => root.unmount(),
		reports: () => errors.mock.calls.filter((call) => !isTextareaChildrenWarning(call)),
	};
}

const MODES = ['client', 'hydrate'] as const;

async function mount(
	mode: (typeof MODES)[number],
	name: string,
	component: any,
	props: Record<string, unknown>,
): Promise<Mounted> {
	return mode === 'client' ? mountClient(component, props) : mountHydrated(name, component, props);
}

const COMPONENTS = [
	{
		name: 'ChildrenProp',
		component: ChildrenProp,
		props: (value: unknown) => ({ value }),
	},
	{
		name: 'SpreadChildren',
		component: SpreadChildren,
		props: (value: unknown) => ({ rest: { name: 'body', children: value } }),
	},
	{
		name: 'ChildrenAttrSpread',
		component: ChildrenAttrSpread,
		props: (value: unknown) => ({ value, rest: { name: 'body' } }),
	},
	{
		name: 'ChildrenAttr',
		component: ChildrenAttr,
		props: (value: unknown) => ({ value }),
	},
	{
		name: 'ChildrenAttrCascade',
		component: ChildrenAttrCascade,
		props: (value: unknown) => ({ value, control: undefined, fallback: undefined }),
	},
] as const;

describe('textarea children prop stays the live default across updates', () => {
	it.each(
		MODES.flatMap((mode) =>
			COMPONENTS.map((entry) => ({ ...entry, mode, case: `${entry.name} (${mode})` })),
		),
	)('updates the default on every commit: $case', async ({ mode, name, component, props }) => {
		const mounted = await mount(mode, name, component, props('A'));
		try {
			const textarea = mounted.container.querySelector('textarea')!;
			expect(textarea.defaultValue).toBe('A');
			expect(textarea.value).toBe('A');

			for (const next of ['U', 'V', 7, 'W']) {
				mounted.update(props(next));
				expect(mounted.container.querySelector('textarea')).toBe(textarea);
				expect(textarea.defaultValue).toBe(String(next));
				expect(textarea.value).toBe(String(next));
			}

			// An empty child clears the default; a later value writes it again.
			mounted.update(props(null));
			expect(textarea.defaultValue).toBe('');
			mounted.update(props('back'));
			expect(textarea.defaultValue).toBe('back');
			expect(textarea.value).toBe('back');
			expect(mounted.reports()).toEqual([]);
		} finally {
			mounted.unmount();
		}
	});

	it.each(MODES)('keeps an edited value while the default updates (%s)', async (mode) => {
		const mounted = await mount(mode, 'ChildrenProp', ChildrenProp, { value: 'A' });
		try {
			const textarea = mounted.container.querySelector('textarea')!;
			textarea.value = 'typed';
			mounted.update({ value: 'U' });
			expect(textarea.defaultValue).toBe('U');
			expect(textarea.value).toBe('typed');
		} finally {
			mounted.unmount();
		}
	});

	it.each(MODES)('removes and restores a spread children writer (%s)', async (mode) => {
		const mounted = await mount(mode, 'SpreadChildren', SpreadChildren, {
			rest: { children: 'A' },
		});
		try {
			const textarea = mounted.container.querySelector('textarea')!;
			expect(textarea.defaultValue).toBe('A');

			mounted.update({ rest: {} });
			expect(textarea.defaultValue).toBe('');
			expect(textarea.value).toBe('');

			mounted.update({ rest: { children: 'B' } });
			expect(textarea.defaultValue).toBe('B');
			expect(textarea.value).toBe('B');

			mounted.update({ rest: { children: 'C' } });
			expect(textarea.defaultValue).toBe('C');
			expect(textarea.value).toBe('C');
		} finally {
			mounted.unmount();
		}
	});

	// Per ReactDOMTextarea-test.js:186, removing a defaultValue writer clears the
	// default. Children that take over afterwards own the whole default rather
	// than appending to the removed writer's text.
	it.each(MODES)('hands the default from defaultValue to children (%s)', async (mode) => {
		const mounted = await mount(mode, 'SpreadChildren', SpreadChildren, {
			rest: { defaultValue: 'X' },
		});
		try {
			const textarea = mounted.container.querySelector('textarea')!;
			expect(textarea.defaultValue).toBe('X');

			mounted.update({ rest: {} });
			expect(textarea.defaultValue).toBe('');

			mounted.update({ rest: { defaultValue: 'Y' } });
			expect(textarea.defaultValue).toBe('Y');

			// A client mount writes the initial default through `.value`, so only the
			// default is asserted here; the live value's dirty flag differs by mode.
			mounted.update({ rest: { children: 'B' } });
			expect(textarea.defaultValue).toBe('B');

			mounted.update({ rest: { children: 'C' } });
			expect(textarea.defaultValue).toBe('C');

			mounted.update({ rest: {} });
			expect(textarea.defaultValue).toBe('');
		} finally {
			mounted.unmount();
		}
	});
});

describe('textarea signal children beside a signal host prop', () => {
	// A signal-held host prop re-applies the host's props without re-running its
	// child binding, so that path must leave a live child's Text in place too.
	it.each([false, true].flatMap((dev) => MODES.map((mode) => ({ dev, mode }))))(
		'keeps the child default through host prop updates ($mode, dev=$dev)',
		async ({ dev, mode }) => {
			const source = `import { signal$ } from 'octane/signals';
export const title$ = signal$('first');
export const child$ = signal$('A');
export function App() @{ <main><textarea {...{ title: title$, children: child$ }} /></main> }`;
			const options = {
				id: `/src/textarea-signal-children-${dev}-${mode}.tsrx`,
				compileOptions: { dev },
				runtimeModules: { 'octane/signals': Signals },
			};
			const client = loadCompiledFixtureSource(source, { ...options, mode: 'client' });
			const container = createContainer();
			const owner = Object.freeze({ scopeKey: options.id });
			let root: Root;
			if (mode === 'hydrate') {
				const server = loadCompiledFixtureSource(source, { ...options, mode: 'server' });
				container.innerHTML = ServerRT.renderToString(server.App, {}).html;
				const recoverable: unknown[] = [];
				root = hydrateRoot(
					container,
					client.App,
					{},
					{ signalOwner: owner, onRecoverableError: (error) => recoverable.push(error) },
				);
				await act(() => {});
				expect(recoverable).toEqual([]);
			} else {
				root = createRoot(container, { signalOwner: owner });
				flushSync(() => root.render(client.App, {}));
			}
			try {
				const textarea = container.querySelector('textarea')!;
				expect(textarea.title).toBe('first');
				expect(textarea.defaultValue).toBe('A');

				runWithSignalOwner(owner, () => client.title$.set('second'));
				await expect.poll(() => textarea.title).toBe('second');
				expect(textarea.defaultValue).toBe('A');

				runWithSignalOwner(owner, () => client.child$.set('B'));
				await expect.poll(() => textarea.defaultValue).toBe('B');

				runWithSignalOwner(owner, () => client.title$.set('third'));
				await expect.poll(() => textarea.title).toBe('third');
				expect(textarea.defaultValue).toBe('B');

				runWithSignalOwner(owner, () => client.child$.set('C'));
				await expect.poll(() => textarea.defaultValue).toBe('C');
				expect(container.querySelector('textarea')).toBe(textarea);
			} finally {
				root.unmount();
			}
		},
	);
});
