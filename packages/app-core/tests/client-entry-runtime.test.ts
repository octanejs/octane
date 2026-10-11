// @vitest-environment jsdom
import { createRequire } from 'node:module';
import { expect, it, vi } from 'vitest';
import { flushSync, type ComponentBody, type FragmentInstance, type Root } from 'octane';
import * as ServerRuntime from 'octane/server';
import * as EntryRuntime from '../src/client-entry-runtime.js';
import { createPropsWrapper, createRootBoundaryWrapper } from '../src/server/component-wrappers.js';
import {
	evaluateCompiledFixtureCode,
	loadCompiledFixtureSource,
} from '../../octane/tests/_server-fixture.js';
import { act } from '../../octane/tests/_helpers.js';

// The generator is a Node tool; keep Vite's browser URL transform out of it.
const require = createRequire(import.meta.url);
const { create_client_entry_source } =
	require('../src/codegen.js') as typeof import('../src/codegen.js');

const fixture = `import { Fragment, use, useState } from 'octane';
let pending: Promise<string> = Promise.resolve('ready');
export function configure(value: Promise<string>) { pending = value; }
export function Page() @{
 const [phase, setPhase] = useState('ready');
 if (phase === 'error') throw new Error('route failure');
 <section class="page">
  <button class="suspend" onClick={() => setPhase('pending')}>Load</button>
  <button class="fail" onClick={() => setPhase('error')}>Fail</button>
  @if (phase === 'pending') {
   const value = use(pending);
   <p class="value">{value as string}</p>
  } @else { <p class="value">ready</p> }
  <input class="draft" defaultValue="seed" />
 </section>
}
export function Pending(props) @{
 <section class="pending">
  <p>{props.label as string}</p>
  <Fragment ref={props.fragmentRef}>
   <form action={props.submit}>
    <input name="note" defaultValue="note seed" />
    <button type="submit">Send</button>
   </form>
  </Fragment>
 </section>
}
export function Catch(props) @{
 <button class="reset" onClick={props.reset}>{props.prefix + ': ' + props.error.message}</button>
}`;

interface Fixture {
	Page: ComponentBody;
	Pending: ComponentBody;
	Catch: ComponentBody;
	configure(value: Promise<string>): void;
}

it.each(['default', 'explicit override'] as const)(
	'hydrates document-supplied boundaries and keeps their children interactive (%s runtime)',
	async (runtime) => {
		const id = '/src/client-entry-boundaries.tsrx';
		const server = loadCompiledFixtureSource<Fixture>(fixture, {
			id,
			mode: 'server',
			compileOptions: { dev: false, hmr: false },
		});
		const client = loadCompiledFixtureSource<Fixture>(fixture, {
			id,
			mode: 'client',
			compileOptions: { dev: false, hmr: false },
		});
		let resolve!: (value: string) => void;
		const pending = new Promise<string>((done) => {
			resolve = done;
		});
		client.configure(pending);
		const fragmentRef: { current: FragmentInstance | null } = { current: null };
		const submitted: FormDataEntryValue[] = [];
		const reads: string[] = [];
		const defaults = {
			get label() {
				reads.push('pending label');
				return 'Waiting for route';
			},
			fragmentRef,
			submit(data: FormData) {
				submitted.push(data.get('note')!);
			},
		};
		Object.defineProperty(client.Pending, 'defaultProps', {
			get() {
				expect(this).toBe(client.Pending);
				reads.push('pending defaults');
				return defaults;
			},
		});
		Object.defineProperty(client.Catch, 'defaultProps', {
			get() {
				expect(this).toBe(client.Catch);
				reads.push('catch defaults');
				return { prefix: 'Caught' };
			},
		});
		const pageProps = { params: {}, url: '/example' };
		const body = createRootBoundaryWrapper(
			createPropsWrapper(server.Page, pageProps),
			{ pending: server.Pending, catch: server.Catch },
			ServerRuntime,
		);
		const container = document.createElement('div');
		container.id = 'root';
		container.innerHTML = (await ServerRuntime.renderToString(body)).html;
		document.body.appendChild(container);
		const page = container.querySelector('.page')!;
		const input = container.querySelector<HTMLInputElement>('input.draft')!;
		input.value = 'before hydration';
		const data = document.createElement('script');
		data.id = '__octane_data';
		data.type = 'application/json';
		data.textContent = JSON.stringify({
			entry: '/page',
			exportName: 'Page',
			...pageProps,
			rootBoundary: {
				pending: { path: '/pending', exportName: 'Pending' },
				catch: { path: '/catch', exportName: 'Catch' },
			},
		});
		document.body.appendChild(data);
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		const recovery: unknown[] = [];
		let root: Root | undefined;
		let overrideUsed = false;
		const entryRuntime = {
			...EntryRuntime,
			hydrateRoot: (...args: Parameters<typeof EntryRuntime.hydrateRoot>) => {
				if (runtime === 'explicit override') overrideUsed = true;
				root = EntryRuntime.hydrateRoot(args[0], args[1], args[2], {
					...args[3],
					onRecoverableError: (error) => recovery.push(error),
				});
				return root;
			},
		};
		try {
			// No app config is supplied: custom server document data still selects both boundaries.
			evaluateCompiledFixtureCode(
				create_client_entry_source({
					staticEntries: ['/page', '/pending', '/catch'],
					...(runtime === 'explicit override' ? { runtimeModuleId: '@fixture/client' } : {}),
				}),
				'/generated/client-entry.js',
				'client',
				{
					[require.resolve('../src/client-entry-runtime.js')]: entryRuntime,
					'@fixture/client': entryRuntime,
					'/page': client,
					'/pending': client,
					'/catch': client,
				},
			);
			await vi.waitFor(() => expect(root).toBeDefined());
			flushSync(() => {});
			expect(container.querySelector('.page')).toBe(page);
			expect(container.querySelector('input.draft')).toBe(input);
			expect(input.value).toBe('before hydration');
			expect(overrideUsed).toBe(runtime === 'explicit override');
			flushSync(() => container.querySelector<HTMLButtonElement>('.suspend')!.click());
			expect(container.querySelector('.pending p')?.textContent).toBe('Waiting for route');
			expect(reads).toContain('pending defaults');
			expect(reads).toContain('pending label');
			const form = container.querySelector('form')!;
			const note = form.querySelector('input')!;
			note.value = 'fallback draft';
			expect(form.hasAttribute('action')).toBe(false);
			const submit = new Event('submit', { bubbles: true, cancelable: true });
			await act(() => {
				form.dispatchEvent(submit);
			});
			expect(submit.defaultPrevented).toBe(true);
			expect(submitted).toEqual(['fallback draft']);
			expect(fragmentRef.current).not.toBeNull();
			const events: string[] = [];
			const listener = () => events.push('fragment event');
			fragmentRef.current!.addEventListener('probe', listener);
			note.dispatchEvent(new Event('probe', { bubbles: true }));
			expect(events).toEqual(['fragment event']);
			fragmentRef.current!.removeEventListener('probe', listener);
			await act(async () => {
				resolve('loaded');
				await pending;
			});
			expect(container.querySelector('.pending')).toBeNull();
			expect(fragmentRef.current).toBeNull();
			expect(container.querySelector('.value')?.textContent).toBe('loaded');
			flushSync(() => container.querySelector<HTMLButtonElement>('.fail')!.click());
			const reset = container.querySelector<HTMLButtonElement>('.reset')!;
			expect(reset.textContent).toBe('Caught: route failure');
			expect(reads).toContain('catch defaults');
			flushSync(() => reset.click());
			expect(container.querySelector('.reset')).toBeNull();
			expect(container.querySelector('.value')?.textContent).toBe('ready');
			expect(recovery).toEqual([]);
			expect(errors.mock.calls).toEqual([]);
		} finally {
			root?.unmount();
			container.remove();
			data.remove();
			errors.mockRestore();
		}
		expect(container.childNodes).toHaveLength(0);
		expect(fragmentRef.current).toBeNull();
	},
);
