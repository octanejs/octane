import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import {
	EXTERNAL_HYDRATION_PROMISE,
	act,
	createRoot,
	flushSync,
	hydrateRoot,
} from '../../src/index.js';
import { EXTERNAL_HYDRATION_PROMISE as CONSTANTS_MARKER } from '../../src/constants.js';
import * as ServerRuntime from 'octane/server';
import { loadServerFixture } from '../_server-fixture.js';
import {
	ExternalBoundary,
	MixedHydrationOwners,
} from './_fixtures/external-hydration-promise.tsrx';

const fixture = join(import.meta.dirname, '_fixtures/external-hydration-promise.tsrx');
const server = loadServerFixture(fixture);

interface MarkedThenable<T> extends PromiseLike<T> {
	readonly [EXTERNAL_HYDRATION_PROMISE]: true;
	status?: 'pending' | 'fulfilled';
	value?: T;
}

function fulfilled<T>(value: T, external = false): MarkedThenable<T> | PromiseLike<T> {
	return {
		...(external ? { [EXTERNAL_HYDRATION_PROMISE]: true as const } : {}),
		status: 'fulfilled' as const,
		value,
		then: Promise.resolve(value).then.bind(Promise.resolve(value)),
	} as MarkedThenable<T>;
}

function pending<T>() {
	let resolve!: (value: T) => void;
	const source = new Promise<T>((next) => {
		resolve = next;
	});
	return {
		thenable: {
			[EXTERNAL_HYDRATION_PROMISE]: true as const,
			then: source.then.bind(source),
		} satisfies MarkedThenable<T>,
		resolve,
	};
}

let container: HTMLDivElement;
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
});
afterEach(() => container.remove());

describe('externally hydrated thenables', () => {
	it('exports one marker and leaves ordinary seed ordering intact', () => {
		expect(EXTERNAL_HYDRATION_PROMISE).toBe(CONSTANTS_MARKER);
		expect(ServerRuntime.EXTERNAL_HYDRATION_PROMISE).toBe(CONSTANTS_MARKER);

		const { html } = ServerRuntime.renderToString(server.MixedHydrationOwners, {
			external: fulfilled('external', true),
			ordinary: fulfilled('ordinary'),
		});
		expect(html).toContain('data-octane-suspense>["ordinary"]</script>');
		expect(html).not.toContain('["external"');

		container.innerHTML = html;
		const node = container.querySelector('#mixed-hydration-owners');
		const root = hydrateRoot(container, MixedHydrationOwners, {
			external: fulfilled('external', true),
			ordinary: Promise.resolve('client'),
		});
		flushSync(() => {});
		expect(container.querySelector('#mixed-hydration-owners')).toBe(node);
		expect(node?.textContent).toBe('external:ordinary');
		root.unmount();
	});

	it('keeps marked pending values on the ordinary suspense retry path', async () => {
		const value = pending<string>();
		const root = createRoot(container);
		root.render(ExternalBoundary, { promise: value.thenable });
		flushSync(() => {});
		expect(container.querySelector('.pending')?.textContent).toBe('pending');
		await act(() => value.resolve('ready'));
		expect(container.querySelector('.resolved')?.textContent).toBe('ready');
		root.unmount();
	});
});
