import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import * as RT from 'octane/server';

// SSR of JSX tags that resolve to a HOST tag STRING at runtime. Two regimes:
//   - TEMPLATE position (`@{ … }` body): `<props.parts.title>` lowers to
//     `ssrComponent(__s, props.parts.title, …)` — the string branch serializes
//     the host element inside the component's one-block range, so the client's
//     componentSlot adopts it uniformly on hydration.
//   - VALUE position (`.tsx` return / `{expr}` hole): the de-opt descriptor
//     path (`ssrChild` → `ssrHostElement`) — already string-aware.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/host-string-tag.tsrx',
);

function evalServer(source: string, file: string): Record<string, any> {
	let { code } = compile(source, file, { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	const fn = new Function('__rt', '__exports', code + '\nreturn __exports;');
	return fn(RT, {});
}

const mod = evalServer(readFileSync(FIXTURE, 'utf8'), 'host-string-tag.tsrx');

describe('SSR host string tags — template position', () => {
	it('serializes a member-expression tag as a host element in one block range', async () => {
		const { html } = await RT.renderToString(mod.Card, {
			parts: { title: 'h1' },
			text: 'Hi',
			klass: 'big',
		});
		expect(html).toBe(
			'<div id="card"><!--[--><h1 id="t" class="big"><!--[-->Hi<!--]--></h1><!--]--></div>',
		);
	});

	it('serializes a variable tag wrapping a component child (nested block)', async () => {
		const { html } = await RT.renderToString(mod.Wrap, { tag: 'article' });
		expect(html).toContain('<article id="inner">');
		expect(html).toContain('count:0');
		// The component child inside the dynamic host carries its own block range.
		expect(html).toMatch(/<article id="inner"><!--\[-->.*<!--\]--><\/article>/);
	});

	it('serializes a childless dynamic VOID tag self-closed', async () => {
		const { html } = await RT.renderToString(mod.Bare, { tag: 'hr' });
		expect(html).toBe('<div id="bare"><!--[--><hr data-x="1"/><!--]--></div>');
	});

	it('drops event/ref props from the serialized element', async () => {
		const { html } = await RT.renderToString(mod.Clicky, { tag: 'button' });
		expect(html).toContain('<button id="btn">');
		expect(html).not.toContain('onPick');
		expect(html).not.toContain('onClick');
		expect(html).not.toContain('ref=');
	});

	it('emits NO hydration markers under renderToStaticMarkup', async () => {
		const { html } = await RT.renderToStaticMarkup(mod.Card, {
			parts: { title: 'h2' },
			text: 'Hi',
			klass: null,
		});
		expect(html).toBe('<div id="card"><h2 id="t">Hi</h2></div>');
	});

	it('rejects an invalid (markup-injecting) tag like React', async () => {
		await expect(async () =>
			RT.renderToString(mod.Card, {
				parts: { title: 'div><img src=x onerror=alert(1)>' },
				text: 'x',
			}),
		).rejects.toThrow(/Invalid tag/);
	});
});
