import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { createRoot, flushSync } from '../../src/index.js';
import { renderToString } from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture.js';
import * as Fixture from './_fixtures/catch-destructured-param.tsrx';

// A `@catch` parameter may be a destructuring pattern, annotated or not, whose
// defaults read component locals. Its bindings belong to the error arm and
// shadow same-named component locals, on both the server and client.

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

const text = (selector: string) =>
	[...container.querySelectorAll(selector)].map((node) => node.textContent);

describe('@catch destructuring parameters', () => {
	function mount(view: View, props: Props) {
		const caught: string[] = [];
		const failures: string[] = [];
		const root = createRoot(container, {
			onCaughtError: (error: unknown) => caught.push(message(error)),
			onUncaughtError: (error: unknown) => failures.push(message(error)),
			onRecoverableError: (error: unknown) => failures.push(message(error)),
		});
		flushSync(() => root.render(Client[view], props));
		return {
			caught,
			failures,
			render: (next: Props) => flushSync(() => root.render(Client[view], next)),
			unmount: () => flushSync(() => root.unmount()),
		};
	}

	for (const view of ['UnannotatedPattern', 'AnnotatedPattern'] as const) {
		it(`${view}: renders the destructured message and resets through the reset parameter`, () => {
			const page = mount(view, { state: { failed: true }, label: view });
			const button = container.querySelector('.retry');
			expect(text('.retry')).toEqual([`${view} failed`]);
			expect(page.caught).toEqual([`${view} failed`]);

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
		expect(text('.outer')).toEqual(['first outer']);
		expect(text('.caught')).toEqual(['first fallback:E1']);

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
		expect(text('.caught')).toEqual(['first+second']);
		expect(page.failures).toEqual([]);
		expect(errors).toEqual([]);
		page.unmount();
	});

	it.each([
		['UnannotatedPattern', undefined, 'server failed'],
		['AnnotatedPattern', undefined, 'server failed'],
		['DefaultFromParent', { code: 'E1' }, 'server fallback:E1'],
		['ArrayPattern', ['first'], 'first+server'],
	] as const)('%s: the server renders the destructured error arm', (view, thrown, expected) => {
		container.innerHTML = renderToString(server[view], {
			state: { failed: true },
			label: 'server',
			thrown,
		}).html;
		expect(text('.retry, .caught')).toEqual([expected]);
	});
});
