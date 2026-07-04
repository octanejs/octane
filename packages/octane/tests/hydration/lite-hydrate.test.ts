import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import { hydrateRoot, flushSync } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { Shell } from './_fixtures/lite.tsrx';

// SSR Phase 6 — hookless "lite" nested components hydrateRoot: componentSlotLite
// adopts the server's `<!--[-->…<!--]-->` range instead of inlining fresh DOM.

const FIXTURE = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/lite.tsrx');

function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'lite.tsrx', { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		'const {$1} = __rt;',
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

describe('hydrateRoot — hookless lite components (SSR Phase 6)', () => {
	it('adopts each lite component (same elements), incl. the block-skipped 2nd one', async () => {
		const { html } = ServerRT.renderToString(server.Shell, { title: 'T', a: 'Alpha', b: 'Beta' });
		expect(html).toBe(
			'<div id="shell"><h3>T</h3>' +
				'<!--[--><span class="badge">Alpha</span><!--]-->' +
				'<!--[--><span class="badge">Beta</span><!--]-->' +
				'</div>',
		);

		container.innerHTML = html;
		const badges = [...container.querySelectorAll('span.badge')];
		expect(badges.length).toBe(2);

		const root = hydrateRoot(container, Shell, { title: 'T', a: 'Alpha', b: 'Beta' });
		flushSync(() => {});

		// Both lite components were ADOPTED (same element instances, right order).
		expect([...container.querySelectorAll('span.badge')]).toEqual(badges);
		expect(badges.map((b) => b.textContent)).toEqual(['Alpha', 'Beta']);
		root.unmount();
	});
});
