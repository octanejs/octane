import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ServerRT from 'octane/server';
import { mount } from './_helpers';
import { loadCompiledFixtureSource } from './_server-fixture.js';
import { hydrateRoot, flushSync } from '../src/index.js';
import { RetTry, AtTry } from './_fixtures/try-fold.tsrx';

const FIXTURE = join(process.cwd(), 'packages/octane/tests/_fixtures/try-fold.tsrx');
function serverModule(): Record<string, any> {
	return loadCompiledFixtureSource(readFileSync(FIXTURE, 'utf8'), {
		id: 'try-fold.tsrx',
		mode: 'server',
	});
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
