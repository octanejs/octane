import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import { hydrateRoot, flushSync } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { Counter, bump } from './_fixtures/markerless-text.tsx';

// An only-child bare `{expr}` value hole lowers MARKERLESS on both sides: the
// server emits the host's bare text (no `<!--[-->…<!--]-->`), the client mounts a
// plain Text node, and hydration ADOPTS that text node (same node, interactive)
// — full parity with a `.tsrx` `{… as string}` text hole.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/markerless-text.tsx',
);

function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'markerless-text.tsx', { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, '__exports.$1 = function $1');
	return new Function('__rt', '__exports', code + '\nreturn __exports;')(ServerRT, {});
}

describe('hydrateRoot — markerless only-child `{expr}` value hole', () => {
	const server = serverModule();
	let container: HTMLElement;
	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
	});
	afterEach(() => container.remove());

	it('compiles markerless: client uses childTextHole, server uses ssrChildText', () => {
		const client = compile(readFileSync(FIXTURE, 'utf8'), 'markerless-text.tsx', {
			mode: 'client',
		}).code;
		const srv = compile(readFileSync(FIXTURE, 'utf8'), 'markerless-text.tsx', {
			mode: 'server',
		}).code;
		expect(client).toContain('childTextHole(');
		expect(client).not.toContain('<!>'); // no placeholder baked into the template
		expect(srv).toContain('ssrChildText(');
	});

	it('SSR is markerless and the client adopts the text node (interactive)', async () => {
		const { html } = ServerRT.renderToString(server.Counter, {});
		// Bare text inside the span — no childSlot block range.
		expect(html).toContain('<span id="c">0</span>');
		expect(html).not.toContain('<!--[-->');

		container.innerHTML = html;
		const span = container.querySelector('#c') as HTMLElement;
		const textNode = span.firstChild; // the server's bare text node
		expect(textNode?.nodeType).toBe(3);

		hydrateRoot(container, Counter, {});
		flushSync(() => {});

		// Adopted, not rebuilt: same span AND same text node.
		expect(container.querySelector('#c')).toBe(span);
		expect(span.firstChild).toBe(textNode);
		expect(span.textContent).toBe('0');

		// The markerless text binding is live.
		flushSync(() => bump());
		expect(span.textContent).toBe('1');
		expect(span.firstChild).toBe(textNode); // updated in place, still the same node
	});
});
