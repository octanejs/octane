import { loadCompiledFixtureSource } from '../_server-fixture.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRoot, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { ReentryLeaf, ReentryOuter } from './_fixtures/root-reentry.tsrx';

const FIXTURE = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/root-reentry.tsrx');

function serverModule(): Record<string, any> {
	return loadCompiledFixtureSource(readFileSync(FIXTURE, 'utf8'), {
		id: 'root-reentry.tsrx',
		mode: 'server',
		compileOptions: { mode: 'server' },
	});
}

const server = serverModule();
let outer: HTMLDivElement;
let inner: HTMLDivElement;
let foreign: HTMLDivElement;

beforeEach(() => {
	outer = document.createElement('div');
	inner = document.createElement('div');
	foreign = document.createElement('div');
	document.body.append(outer, inner, foreign);
});

afterEach(() => {
	outer.remove();
	inner.remove();
	foreign.remove();
});

describe('hydrateRoot — synchronous root re-entry', () => {
	it('keeps nested hydration and a foreign client root isolated from the outer cursor', () => {
		outer.innerHTML = ServerRT.renderToString(server.ReentryOuter, { enter() {} }).html;
		inner.innerHTML = ServerRT.renderToString(server.ReentryLeaf, { id: 'inner-button' }).html;

		const outerButton = outer.querySelector('#outer-button');
		const outerTail = outer.querySelector('#outer-tail');
		const innerButton = inner.querySelector('#inner-button');
		const foreignRoot = createRoot(foreign);
		let innerRoot: ReturnType<typeof hydrateRoot> | null = null;

		const outerRoot = hydrateRoot(outer, ReentryOuter, {
			enter() {
				if (innerRoot !== null) return;
				innerRoot = hydrateRoot(inner, ReentryLeaf, { id: 'inner-button' });
				foreignRoot.render(ReentryLeaf, { id: 'foreign-button' });
			},
		});

		// Both hydration roots retain their server nodes. Rendering the unrelated
		// client root during the outer render must not consume either hydration cursor.
		expect(outer.querySelector('#outer-button')).toBe(outerButton);
		expect(outer.querySelector('#outer-tail')).toBe(outerTail);
		expect(inner.querySelector('#inner-button')).toBe(innerButton);
		expect(foreign.querySelector('#foreign-button')?.textContent).toBe('foreign-button:0');

		flushSync(() => {
			(outerButton as HTMLButtonElement).click();
			(innerButton as HTMLButtonElement).click();
			(foreign.querySelector('#foreign-button') as HTMLButtonElement).click();
		});
		expect(outerButton?.textContent).toBe('outer:1');
		expect(innerButton?.textContent).toBe('inner-button:1');
		expect(foreign.querySelector('#foreign-button')?.textContent).toBe('foreign-button:1');

		outerRoot.unmount();
		innerRoot!.unmount();
		foreignRoot.unmount();
	});
});
