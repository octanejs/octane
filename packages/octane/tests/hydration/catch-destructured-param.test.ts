import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { createRoot, flushSync, hydrateRoot } from '../../src/index.js';
import { renderToString } from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture.js';
import * as Fixture from './_fixtures/catch-destructured-param.tsrx';

// A `@catch` parameter may be a destructuring pattern, annotated or not, whose
// defaults read component locals. Its bindings belong to the error arm and
// shadow same-named component locals. Client render, server render, and
// hydration of server HTML all produce the same error output from them.

type Props = Fixture.Props;

// An unannotated pattern destructures an `unknown` caught value, which
// TypeScript rejects, so this case is untyped source rather than a typed fixture.
const UNANNOTATED = `
function Result(props) @{
	if (props.state.failed) throw new Error(props.label + ' failed');
	<p class="ok">{props.label + ' ready'}</p>
}
export function UnannotatedPattern(props) @{
	<div>
		@try {
			<Result state={props.state} label={props.label} />
		} @catch ({ message }, retry) {
			<button class="retry" onClick={() => { props.state.failed = false; retry(); }}>{message as string}</button>
		}
	</div>
}`;

function loadUnannotated(mode: 'client' | 'server') {
	return loadCompiledFixtureSource(UNANNOTATED, {
		id: '/catch-unannotated-pattern.tsrx',
		mode,
		compileOptions: { hmr: false, dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' },
	});
}

const Client = { ...Fixture, UnannotatedPattern: loadUnannotated('client').UnannotatedPattern };
const server = {
	...loadServerFixture<typeof Fixture>(
		resolve(import.meta.dirname, '_fixtures/catch-destructured-param.tsrx'),
	),
	UnannotatedPattern: loadUnannotated('server').UnannotatedPattern,
};
type View = keyof typeof Client;

let container: HTMLElement;
let errors: unknown[][];
let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
	errors = [];
	errorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(args));
});
afterEach(() => {
	container.remove();
	errorSpy.mockRestore();
});

function message(error: unknown) {
	return String((error as { message?: unknown })?.message ?? error);
}

// Server and client own separate failure records, as separate processes would.
function copy(props: Props): Props {
	return { ...props, state: { ...props.state } };
}

const text = (selector: string) =>
	[...container.querySelectorAll(selector)].map((node) => node.textContent);

// Hosts around each boundary. Whether the error arm itself is adopted does not
// depend on how its parameter is written, so these cases check the hosts outside.
const OUTSIDE = 'div, .outer';

type Server = { text: string | null; hosts: Element[] } | null;

// The client rendered the server's output and adopted the surrounding hosts.
function expectHydrated(server: Server) {
	if (server === null) return;
	expect(container.textContent).toBe(server.text);
	const hosts = [...container.querySelectorAll(OUTSIDE)];
	expect(hosts).toHaveLength(server.hosts.length);
	hosts.forEach((host, index) => expect(host).toBe(server.hosts[index]));
}

for (const how of ['createRoot', 'hydrateRoot'] as const) {
	describe(`@catch destructuring parameters (${how})`, () => {
		function mount(view: View, props: Props) {
			const caught: string[] = [];
			const failures: string[] = [];
			const options = {
				onCaughtError: (error: unknown) => caught.push(message(error)),
				onUncaughtError: (error: unknown) => failures.push(message(error)),
				onRecoverableError: (error: unknown) => failures.push(message(error)),
			};
			let serverHtml = '';
			let serverDom: Server = null;
			let root: ReturnType<typeof createRoot>;
			if (how === 'hydrateRoot') {
				serverHtml = renderToString(server[view], copy(props)).html;
				container.innerHTML = serverHtml;
				serverDom = {
					text: container.textContent,
					hosts: [...container.querySelectorAll(OUTSIDE)],
				};
				root = hydrateRoot(container, Client[view], props, options);
			} else {
				root = createRoot(container, options);
				root.render(Client[view], props);
			}
			flushSync(() => {});
			return {
				serverHtml,
				serverDom,
				caught,
				failures,
				render: (next: Props) => flushSync(() => root.render(Client[view], next)),
				unmount: () => flushSync(() => root.unmount()),
			};
		}

		for (const view of ['UnannotatedPattern', 'AnnotatedPattern'] as const) {
			it(`${view}: renders the destructured message and resets through the reset parameter`, () => {
				const page = mount(view, { state: { failed: true }, label: view });
				if (how === 'hydrateRoot') expect(page.serverHtml).toContain(`${view} failed`);
				const button = container.querySelector('.retry');
				expect(text('.retry')).toEqual([`${view} failed`]);
				expect(page.caught).toEqual([`${view} failed`]);
				expectHydrated(page.serverDom);

				flushSync(() => (container.querySelector('.retry') as HTMLButtonElement).click());
				expect(text('.ok')).toEqual([`${view} ready`]);
				expect(text('.retry')).toEqual([]);
				expect(button?.isConnected).toBe(false);
				expect(page.failures).toEqual([]);
				expect(errors).toEqual([]);
				page.unmount();
			});
		}

		it('evaluates pattern defaults against component locals and shadows same-named locals', () => {
			const props: Props = { state: { failed: true }, label: 'first', thrown: { code: 'E1' } };
			const page = mount('DefaultFromParent', props);
			if (how === 'hydrateRoot') expect(page.serverHtml).toContain('first fallback:E1');
			expect(text('.outer')).toEqual(['first outer']);
			expect(text('.caught')).toEqual(['first fallback:E1']);
			expectHydrated(page.serverDom);

			// The error arm re-renders with the parent's new locals.
			page.render({ ...props, label: 'second' });
			expect(text('.outer')).toEqual(['second outer']);
			expect(text('.caught')).toEqual(['second fallback:E1']);

			expect(page.failures).toEqual([]);
			expect(errors).toEqual([]);
			page.unmount();
		});

		it('binds array patterns, including a default that reads props', () => {
			const page = mount('ArrayPattern', {
				state: { failed: true },
				label: 'second',
				thrown: ['first'],
			});
			if (how === 'hydrateRoot') expect(page.serverHtml).toContain('first+second');
			expect(text('.caught')).toEqual(['first+second']);
			expectHydrated(page.serverDom);
			expect(page.failures).toEqual([]);
			expect(errors).toEqual([]);
			page.unmount();
		});
	});
}
