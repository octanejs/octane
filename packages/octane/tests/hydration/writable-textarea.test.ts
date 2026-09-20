import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	act,
	createRoot,
	flushSync,
	hydrateRoot,
	requestFormReset,
	type Root,
} from '../../src/runtime.js';
import { renderToString } from '../../src/runtime.server.js';
import * as Signals from '../../src/signals/index.js';
import { runWithSignalOwner } from '../../src/signals/index.js';
import { loadCompiledFixtureSource } from '../_server-fixture.js';

describe('writable textarea reset baselines', () => {
	let root: Root | undefined;
	afterEach(() => {
		root?.unmount();
		root = undefined;
		document.body.textContent = '';
		vi.restoreAllMocks();
	});

	it.each(
		[false, true].flatMap((dev) =>
			[false, true].flatMap((spread) => [false, true].map((hydrate) => ({ dev, spread, hydrate }))),
		),
	)(
		'preserves textarea edits while keeping the winning value as the reset baseline (%j)',
		async ({ dev, spread, hydrate }) => {
			const source = `import { signal$, derived$ } from 'octane/signals';
export const draft$ = signal$('server');
const readonly$ = derived$(() => draft$.get());
export function App(props) @{
  const fields = {value: draft$};
  const handle = props.mode === 'writable' ? draft$ : readonly$;
  <form><textarea ${spread ? '{...fields}' : ''} value={props.mode === 'snapshot' ? draft$.get() : handle} readOnly={props.mode !== 'writable'} /></form>
}`;
			const options = {
				id: `/src/textarea-native-echo-${dev}-${spread}-${hydrate}.tsrx`,
				compileOptions: { dev },
				runtimeModules: { 'octane/signals': Signals },
			};
			const client = loadCompiledFixtureSource(source, { ...options, mode: 'client' });
			const container = document.createElement('div');
			document.body.append(container);
			const owner = Object.freeze({ scopeKey: options.id });
			if (hydrate) {
				const server = loadCompiledFixtureSource(source, { ...options, mode: 'server' });
				container.innerHTML = renderToString(server.App, { mode: 'writable' }).html;
				root = hydrateRoot(container, client.App, { mode: 'writable' }, { signalOwner: owner });
			} else {
				root = createRoot(container, { signalOwner: owner });
				root.render(client.App, { mode: 'writable' });
			}
			const textarea = container.querySelector('textarea')!;
			const form = container.querySelector('form')!;
			textarea.focus();
			textarea.value = 'native edit';
			textarea.setSelectionRange(3, 6, 'backward');
			textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
			await act(() => {});
			expect(textarea.value).toBe('native edit');
			expect(runWithSignalOwner(owner, () => client.draft$.get())).toBe('native edit');
			expect(textarea.defaultValue).toBe('native edit');
			expect([textarea.selectionStart, textarea.selectionEnd, textarea.selectionDirection]).toEqual(
				[3, 6, 'backward'],
			);
			await act(() => runWithSignalOwner(owner, () => client.draft$.set('programmatic')));
			expect(textarea.value).toBe('programmatic');
			expect(textarea.defaultValue).toBe('programmatic');
			textarea.value = 'programmatic edited';
			textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
			await act(() => requestFormReset(form));
			expect(textarea.value).toBe('programmatic edited');
			expect(textarea.defaultValue).toBe('programmatic edited');
			for (const mode of ['readonly', 'snapshot']) {
				await act(() => root!.render(client.App, { mode }));
				expect(container.querySelector('textarea')).toBe(textarea);
				textarea.value = mode + ' echo';
				await act(() => runWithSignalOwner(owner, () => client.draft$.set(mode + ' echo')));
				expect(textarea.value).toBe(mode + ' echo');
				expect(textarea.defaultValue).toBe(mode + ' echo');
			}
		},
	);
	it.each([false, true])(
		'preserves native composition echoes while a different programmatic value wins (spread=%s)',
		async (spread) => {
			const source = `import { signal$ } from 'octane/signals';
export const draft$ = signal$('server');
export function App() @{ <textarea ${spread ? '{...{value: draft$}}' : 'value={draft$}'} /> }`;
			const client = loadCompiledFixtureSource(source, {
				id: `/src/textarea-composition-echo-${spread}.tsrx`,
				mode: 'client',
				compileOptions: { dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' },
				runtimeModules: { 'octane/signals': Signals },
			});
			const container = document.createElement('div');
			document.body.append(container);
			const owner = Object.freeze({ scopeKey: 'textarea-composition-' + spread });
			root = createRoot(container, { signalOwner: owner });
			root.render(client.App, {});
			const textarea = container.querySelector('textarea')!;
			textarea.focus();
			textarea.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
			textarea.value = 'server候補';
			textarea.setSelectionRange(textarea.value.length, textarea.value.length);
			textarea.dispatchEvent(
				new InputEvent('input', {
					bubbles: true,
					isComposing: true,
					inputType: 'insertCompositionText',
				}),
			);
			await act(() => {});
			expect(textarea.value).toBe('server候補');
			expect(textarea.defaultValue).toBe('server候補');
			expect(textarea.selectionStart).toBe(textarea.value.length);
			await act(() => runWithSignalOwner(owner, () => client.draft$.set('replacement')));
			expect(textarea.value).toBe('replacement');
			expect(textarea.defaultValue).toBe('replacement');
			textarea.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
			await act(() => {});
			expect(textarea.value).toBe('replacement');
		},
	);

	it.each([false, true])(
		'keeps the committed textarea source and reset baseline during an abandoned replacement (spread=%s)',
		async (spread) => {
			const source = `import { signal$ } from 'octane/signals';
export const a$ = signal$('server');
export const b$ = signal$('other');
export function App(props) @{
  const handle = props.next ? b$ : a$;
  <section><textarea ${spread ? '{...{value: handle}}' : 'value={handle}'} /><p>{props.finish() as string}</p></section>
}`;
			const client = loadCompiledFixtureSource(source, {
				id: `/src/textarea-echo-rollback-${spread}.tsrx`,
				mode: 'client',
				compileOptions: { dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' },
				runtimeModules: { 'octane/signals': Signals },
			});
			const container = document.createElement('div');
			document.body.append(container);
			const owner = Object.freeze({ scopeKey: 'textarea-rollback-' + spread });
			root = createRoot(container, { signalOwner: owner });
			root.render(client.App, { next: false, finish: () => 'ready' });
			const textarea = container.querySelector('textarea')!;
			textarea.value = 'native edit';
			textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
			await act(() => {});
			vi.spyOn(console, 'error').mockImplementation(() => {});
			const pending = new Promise<void>(() => {});
			flushSync(() =>
				root!.render(client.App, {
					next: true,
					finish() {
						throw pending;
					},
				}),
			);
			expect(container.querySelector('textarea')).toBe(textarea);
			expect(textarea.value).toBe('native edit');
			expect(textarea.defaultValue).toBe('native edit');
			textarea.value = 'after rollback';
			textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
			await act(() => {});
			expect(runWithSignalOwner(owner, () => client.a$.get())).toBe('after rollback');
			expect(runWithSignalOwner(owner, () => client.b$.get())).toBe('other');
			expect(textarea.defaultValue).toBe('after rollback');
			await act(() => runWithSignalOwner(owner, () => client.b$.set('other changed')));
			expect(textarea.value).toBe('after rollback');
			await act(() => root!.render(client.App, { next: false, finish: () => 'ready' }));
			await act(() => runWithSignalOwner(owner, () => client.a$.set('programmatic')));
			expect(textarea.value).toBe('programmatic');
			expect(textarea.defaultValue).toBe('programmatic');
		},
	);
});
