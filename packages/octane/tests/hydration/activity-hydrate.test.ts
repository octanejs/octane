import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import { flushSync, hydrateRoot } from '../../src/index.js';
import { flushEffects } from '../_helpers.js';
import * as ServerRT from 'octane/server';
import {
	ActivityHydration,
	ActivityIdHydration,
	NestedActivityHydration,
} from './_fixtures/activity.tsrx';

const FIXTURE = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/activity.tsrx');

function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'activity.tsrx', { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	const fn = new Function('__rt', '__exports', code + '\nreturn __exports;');
	return fn(ServerRT, {});
}

const server = serverModule();
let container: HTMLElement;

beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
});

afterEach(() => container.remove());

describe('hydrateRoot — <Activity>', () => {
	it('adopts visible server content and keeps it interactive', () => {
		const effects: string[] = [];
		const { html } = ServerRT.renderToString(server.ActivityHydration, {
			mode: 'visible',
			onEffect: (value: string) => effects.push(value),
		});
		container.innerHTML = html;
		const button = container.querySelector('#activity-child') as HTMLButtonElement;

		const root = hydrateRoot(container, ActivityHydration, {
			mode: 'visible',
			onEffect: (value: string) => effects.push(value),
		});
		flushSync(() => {});
		flushEffects();

		expect(container.querySelector('#activity-child')).toBe(button);
		expect(effects).toEqual(['mount']);
		flushSync(() => button.click());
		expect(button.textContent).toBe('activity-child:1');
		root.unmount();
	});

	it('hydrates a hidden empty server range into preserved offscreen client state', () => {
		const effects: string[] = [];
		const props = {
			mode: 'hidden',
			onEffect: (value: string) => effects.push(value),
		};
		const { html } = ServerRT.renderToString(server.ActivityHydration, props);
		expect(html).not.toContain('activity-child');
		container.innerHTML = html;

		const root = hydrateRoot(container, ActivityHydration, props);
		flushSync(() => {});
		const button = container.querySelector('#activity-child') as HTMLButtonElement;
		expect(button).not.toBeNull();
		expect(button.style.display).toBe('none');
		expect(effects).toEqual([]);

		flushSync(() => button.click());
		expect(button.textContent).toBe('activity-child:1');
		expect(button.style.display).toBe('none');

		root.render(ActivityHydration, { ...props, mode: 'visible' });
		flushSync(() => {});
		flushEffects();
		expect(container.querySelector('#activity-child')).toBe(button);
		expect(button.style.display).toBe('');
		expect(button.textContent).toBe('activity-child:1');
		expect(effects).toEqual(['mount']);
		root.unmount();
	});

	it('adopts visible server DOM when the client initially hides it', () => {
		const { html } = ServerRT.renderToString(server.ActivityHydration, {
			mode: 'visible',
		});
		container.innerHTML = html;
		const button = container.querySelector('#activity-child') as HTMLButtonElement;

		const root = hydrateRoot(container, ActivityHydration, { mode: 'hidden' });
		flushSync(() => {});
		expect(container.querySelector('#activity-child')).toBe(button);
		expect(button.style.display).toBe('none');

		root.render(ActivityHydration, { mode: 'visible' });
		flushSync(() => {});
		expect(container.querySelector('#activity-child')).toBe(button);
		expect(button.style.display).toBe('');
		root.unmount();
	});

	it('keeps the hydration cursor aligned across a nested hidden Activity', () => {
		const { html } = ServerRT.renderToString(server.NestedActivityHydration, {
			outer: 'visible',
			inner: 'hidden',
		});
		expect(html).toContain('outer-before');
		expect(html).not.toContain('inner-child');
		container.innerHTML = html;
		const before = container.querySelector('#outer-before');
		const after = container.querySelector('#outer-after');
		const tail = container.querySelector('#nested-tail');

		const root = hydrateRoot(container, NestedActivityHydration, {
			outer: 'visible',
			inner: 'hidden',
		});
		flushSync(() => {});
		const inner = container.querySelector('#inner-child') as HTMLButtonElement;
		expect(inner.style.display).toBe('none');
		expect(container.querySelector('#outer-before')).toBe(before);
		expect(container.querySelector('#outer-after')).toBe(after);
		expect(container.querySelector('#nested-tail')).toBe(tail);

		root.render(NestedActivityHydration, { outer: 'visible', inner: 'visible' });
		flushSync(() => {});
		expect(container.querySelector('#inner-child')).toBe(inner);
		expect(inner.style.display).toBe('');
		root.unmount();
	});

	it('defers hidden prerendering until visible siblings consume their server useId positions', () => {
		const { html } = ServerRT.renderToString(server.ActivityIdHydration);
		container.innerHTML = html;
		const visible = container.querySelector('.visible-id') as HTMLElement;
		const serverId = visible.id;

		const root = hydrateRoot(container, ActivityIdHydration);
		const hidden = container.querySelector('.hidden-id') as HTMLElement;
		expect(container.querySelector('.visible-id')).toBe(visible);
		expect(visible.id).toBe(serverId);
		expect(hidden.id).not.toBe(serverId);
		expect(hidden.style.display).toBe('none');
		root.unmount();
	});
});
