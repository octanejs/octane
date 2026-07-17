import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import * as ServerRT from 'octane/server';
import { mount } from './_helpers';
import { hydrateRoot, flushSync } from '../src/index.js';
import { RetTry, AtTry } from './_fixtures/try-fold.tsrx';

const FIXTURE = join(process.cwd(), 'packages/octane/tests/_fixtures/try-fold.tsrx');
function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'try-fold.tsrx', { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, '__exports.$1 = $1; function $1');
	const fn = new Function('__rt', '__exports', code + '\nreturn __exports;');
	return fn(ServerRT, {});
}

describe('folded @try (return-JSX) matches the inline @{} oracle', () => {
	it('byte-equal DOM when the try body renders normally', () => {
		const a = mount(RetTry as any, { boom: false });
		const b = mount(AtTry as any, { boom: false });
		expect(a.html()).toBe(b.html());
		expect(a.find('.ok').textContent).toBe('ok');
		a.unmount();
		b.unmount();
	});

	it('byte-equal DOM when the try body throws (catch renders)', () => {
		const a = mount(RetTry as any, { boom: true });
		const b = mount(AtTry as any, { boom: true });
		expect(a.html()).toBe(b.html());
		expect(a.find('.caught').textContent).toBe('caught');
		a.unmount();
		b.unmount();
	});
});

describe('folded @try hydrates against the @{} oracle markup', () => {
	it('SSR byte-equals the inline form and adopts on hydrate', async () => {
		const server = serverModule();
		const ret = await ServerRT.renderToString(server.RetTry, { boom: false });
		const at = await ServerRT.renderToString(server.AtTry, { boom: false });
		expect(ret.html).toBe(at.html);

		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = ret.html;
		const ok = container.querySelector('.ok') as HTMLElement;
		const root = hydrateRoot(container, RetTry, { boom: false });
		flushSync(() => {});
		expect(container.querySelector('.ok')).toBe(ok); // adopted, not rebuilt
		expect(ok.textContent).toBe('ok');
		root.unmount();
		container.remove();
	});
});
