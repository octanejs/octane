import { describe, expect, it } from 'vitest';
import { act, hydrateRoot } from '../../src/index.js';
import { renderToString } from 'octane/server';
import { loadCompiledFixtureSource } from '../_server-fixture.js';

const NATIVE_HOST =
	'<x-first data-first ref={props.onRef} onpulse={props.onAction}>{value as string}</x-first>';
const EARLIER_ARMS = [
	[
		'delegated listener',
		'<button data-first ref={props.onRef} onClick={props.onAction}>{value as string}</button>',
		'click',
		1,
		false,
	],
	['native listener', NATIVE_HOST, 'pulse', 1, false],
	['native listener shared with external code', NATIVE_HOST, 'pulse', 1, true],
	[
		'no listener',
		'<button data-first ref={props.onRef}>{value as string}</button>',
		'click',
		0,
		false,
	],
] as const;

function sourceForEarlierArm(host: string) {
	return `
function First(props) @{
  @try {
    const value = props.read();
    ${host};
  } @pending { <p>waiting first</p>; }
}
function Second(props) @{
  @try {
    const value = props.read();
    <x-second data-second onpulse={props.onPulse}>{value as string}</x-second>;
  } @pending { <p>waiting second</p>; }
}
export function Gate(props) @{
  props.wake();
  <section>
    <First read={props.read} onRef={props.onRef} onAction={props.onAction} />
    <Second read={props.read} onPulse={props.onPulse} />
  </section>;
}`;
}

describe.each([false, true])('hydration event activation rollback (dev: %s)', (dev) => {
	it.each(EARLIER_ARMS)(
		'commits an independent earlier arm with %s when a later arm recovers',
		async (_kind, host, event, expectedCalls, externalListener) => {
			let ready = true;
			const subscribers: Array<() => void> = [];
			const blocker = { then: (callback: () => void) => subscribers.push(callback) };
			const failure = new Error('registration failed');
			const errors: unknown[] = [];
			const refs: Element[] = [];
			let calls = 0;
			const props = {
				revision: 0,
				wake: () => {
					if (ready) subscribers.splice(0).forEach((callback) => callback());
				},
				read: () => {
					if (!ready) throw blocker;
					return 'ready';
				},
				onRef: (node: Element | null) => {
					if (node !== null) refs.push(node);
				},
				onAction: () => calls++,
				onPulse: () => {},
			};
			const source = sourceForEarlierArm(host);
			const load = (mode: 'client' | 'server') =>
				loadCompiledFixtureSource(source, {
					id: '/independent-arms.tsrx',
					mode,
					compileOptions: { dev, hmr: false },
				});
			const container = document.createElement('div');
			document.body.append(container);
			container.innerHTML = renderToString(load('server')['Gate'], props).html;
			const first = container.querySelector('[data-first]')!;
			const second = container.querySelector('[data-second]')!;
			if (externalListener) first.addEventListener(event, props.onAction);
			const add = second.addEventListener;
			second.addEventListener = function (type, listener, options) {
				if (type === 'pulse' && listener === props.onPulse) throw failure;
				add.call(this, type, listener, options);
			};
			ready = false;
			const client = load('client');
			const component = client['Gate'];
			const root = hydrateRoot(container, component, props, {
				onRecoverableError: (error) => errors.push(error),
			});
			try {
				expect(refs).toEqual([]);
				ready = true;
				await act(() => root.render(component, { ...props, revision: 1 }));
				expect(errors).toHaveLength(1);
				expect((errors[0] as Error).cause).toBe(failure);
				expect(container.querySelector('[data-first]')).toBe(first);
				expect(container.querySelector('[data-second]')).not.toBe(second);
				first.dispatchEvent(new Event(event, { bubbles: true }));
				expect(calls).toBe(expectedCalls);
				expect(refs).toEqual([first]);
			} finally {
				root.unmount();
				if (externalListener) first.removeEventListener(event, props.onAction);
				container.remove();
			}
		},
	);
});
