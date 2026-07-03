import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import * as RT from 'octane/server';

// The public server entry: renderToString(component, props, options) with the
// deprecated `render` alias, CSP nonce stamping, AbortSignal, and the
// per-render suspense deadline override.

const FIXTURES = join(process.cwd(), 'packages/octane/tests/_fixtures');

function evalServer(source: string, file: string): Record<string, any> {
	let { code } = compile(source, file, { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		'const {$1} = __rt;',
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	const fn = new Function('__rt', '__exports', code + '\nreturn __exports;');
	return fn(RT, {});
}

const suspense = evalServer(
	readFileSync(join(FIXTURES, 'ssr-suspense.tsrx'), 'utf8'),
	'ssr-suspense.tsrx',
);
const ssr = evalServer(readFileSync(join(FIXTURES, 'ssr.tsrx'), 'utf8'), 'ssr.tsrx');

describe('renderToString — public API', () => {
	it('render is a deprecated alias of renderToString', () => {
		expect(RT.render).toBe(RT.renderToString);
	});

	it('renders the same result under both names', async () => {
		const a = await RT.renderToString(suspense.AsyncLeaf, { promise: Promise.resolve('x') });
		const b = await RT.render(suspense.AsyncLeaf, { promise: Promise.resolve('x') });
		expect(a).toEqual(b);
	});
});

describe('renderToString — nonce option', () => {
	it('stamps the nonce on the suspense seed script', async () => {
		const out = await RT.renderToString(
			suspense.AsyncLeaf,
			{ promise: Promise.resolve('hello') },
			{ nonce: 'abc123' },
		);
		expect(out.body).toContain(
			'<script type="application/json" data-octane-suspense nonce="abc123">',
		);
	});

	it('stamps the nonce on scoped style tags', async () => {
		const out = await RT.renderToString(ssr.Scoped, undefined, { nonce: 'abc123' });
		expect(out.css).toMatch(/^<style data-octane="tsrx-[0-9a-f]+" nonce="abc123">/);
	});

	it('escapes a hostile nonce', async () => {
		const out = await RT.renderToString(ssr.Scoped, undefined, { nonce: '"><script>' });
		expect(out.css).not.toContain('"><script>');
	});

	it('emits no nonce attribute when the option is absent', async () => {
		const out = await RT.renderToString(suspense.AsyncLeaf, { promise: Promise.resolve('hello') });
		expect(out.body).not.toContain('nonce');
		expect((await RT.renderToString(ssr.Scoped)).css).not.toContain('nonce');
	});
});

describe('renderToString — signal option', () => {
	it('rejects immediately when the signal is already aborted', async () => {
		const controller = new AbortController();
		controller.abort(new Error('request gone'));
		await expect(
			RT.renderToString(
				suspense.AsyncLeaf,
				{ promise: new Promise(() => {}) },
				{ signal: controller.signal },
			),
		).rejects.toThrow('request gone');
	});

	it('rejects a suspended render when aborted mid-wait', async () => {
		const controller = new AbortController();
		const pending = RT.renderToString(
			suspense.AsyncLeaf,
			{ promise: new Promise(() => {}) },
			{ signal: controller.signal },
		);
		queueMicrotask(() => controller.abort(new Error('client disconnected')));
		await expect(pending).rejects.toThrow('client disconnected');
	});
});

describe('renderToString — timeoutMs option', () => {
	it('overrides the global suspense deadline for one render', async () => {
		await expect(
			RT.renderToString(suspense.AsyncLeaf, { promise: new Promise(() => {}) }, { timeoutMs: 20 }),
		).rejects.toThrow('did not settle within 20ms');
	});
});
