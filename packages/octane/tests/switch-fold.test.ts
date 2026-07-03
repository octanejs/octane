import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import * as ServerRT from 'octane/server';
import { mount } from './_helpers';
import { hydrateRoot, flushSync } from '../src/index.js';
import { RetSwitch, AtSwitch } from './_fixtures/switch-fold.tsrx';

const FIXTURE = join(process.cwd(), 'packages/octane/tests/_fixtures/switch-fold.tsrx');
function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'switch-fold.tsrx', { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		'const {$1} = __rt;',
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, 'const $1 = __exports.$1 = function $1');
	const fn = new Function('__rt', '__exports', code + '\nreturn __exports;');
	return fn(ServerRT, {});
}

describe('folded @switch (return-JSX) matches the inline @{} oracle', () => {
	it.each(['a', 'b', 'c'])('byte-equal DOM for k=%s (case + default)', (k) => {
		const a = mount(RetSwitch as any, { k });
		const b = mount(AtSwitch as any, { k });
		expect(a.html()).toBe(b.html());
		a.unmount();
		b.unmount();
	});

	it('matched case renders the right body', () => {
		const a = mount(RetSwitch as any, { k: 'b' });
		expect(a.find('.r').textContent).toBe('B');
		a.unmount();
	});

	it('re-render to a different case matches the oracle', () => {
		const a = mount(RetSwitch as any, { k: 'a' });
		const b = mount(AtSwitch as any, { k: 'a' });
		a.update(RetSwitch as any, { k: 'b' });
		b.update(AtSwitch as any, { k: 'b' });
		expect(a.html()).toBe(b.html());
		expect(a.find('.r').textContent).toBe('B');
		a.unmount();
		b.unmount();
	});
});

describe('folded @switch hydrates against the @{} oracle markup', () => {
	it('SSR byte-equals the inline form and adopts on hydrate', async () => {
		const server = serverModule();
		const ret = await ServerRT.renderToString(server.RetSwitch, { k: 'b' });
		const at = await ServerRT.renderToString(server.AtSwitch, { k: 'b' });
		expect(ret.html).toBe(at.html);

		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = ret.html;
		const span = container.querySelector('.r') as HTMLElement;
		const root = hydrateRoot(container, RetSwitch, { k: 'b' });
		flushSync(() => {});
		expect(container.querySelector('.r')).toBe(span); // adopted, not rebuilt
		expect(span.textContent).toBe('B');
		root.unmount();
		container.remove();
	});
});
