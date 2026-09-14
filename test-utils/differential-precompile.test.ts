import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	compileReactFixture,
	differentialSetup,
	fixtureCacheName,
	packageRewrite,
} from './differential-precompile.js';

let root: string;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'diff-precompile-'));
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

const okDeps = {
	compile: (source: string) => ({ code: `COMPILED:${source}`, errors: [] }),
	transform: (code: string) => ({ code: `TRANSFORMED:${code}` }),
};

function cfg(overrides: Record<string, unknown> = {}) {
	return {
		fixtureDir: join(root, '_fixtures'),
		cacheDir: join(root, '.react-cache'),
		fixtures: 'all' as const,
		deps: okDeps,
		...overrides,
	};
}

describe('fixtureCacheName', () => {
	it('is the slug + source-path hash contract the rigs key on', () => {
		// Pinned: every producer and consumer must agree on this exact string.
		expect(fixtureCacheName('/tmp/fix/counter-diff.tsrx')).toBe('counter-diff-7o3cfl.js');
	});

	it('is stable and path-sensitive', () => {
		const a = fixtureCacheName('/a/x.tsrx');
		expect(fixtureCacheName('/a/x.tsrx')).toBe(a);
		expect(fixtureCacheName('/b/x.tsrx')).not.toBe(a);
	});
});

describe('packageRewrite', () => {
	it('rewrites the bare specifier and preserves subpaths', () => {
		const [pattern, replacement] = packageRewrite('@octanejs/jotai', 'jotai');
		expect(
			`from "@octanejs/jotai";\nfrom '@octanejs/jotai/vanilla';`.replace(pattern, replacement),
		).toBe(`from "jotai";\nfrom "jotai/vanilla";`);
	});

	it('leaves lookalike specifiers alone', () => {
		const [pattern, replacement] = packageRewrite('@octanejs/jotai', 'jotai');
		expect(`from "@octanejs/jotai-extra";`.replace(pattern, replacement)).toBe(
			`from "@octanejs/jotai-extra";`,
		);
	});
});

describe('compileReactFixture', () => {
	it('applies rewrites in order, then the octane→react correction', () => {
		const fixture = join(root, 'a.tsrx');
		writeFileSync(fixture, 'src');
		compileReactFixture(fixture, {
			...cfg(),
			fixtureDir: root,
			rewrites: [
				[/COMPILED/g, 'PKG'],
				[/from\s+"@octanejs\/x"/g, 'from "x"'],
			],
			deps: {
				compile: () => ({ code: `import {} from "@octanejs/x"; import {} from "octane";` }),
				transform: (code) => ({ code }),
			},
		});
		const out = readFileSync(join(root, '.react-cache', fixtureCacheName(fixture)), 'utf8');
		expect(out).toBe(`import {} from "x"; import {} from "react";`);
	});

	it('shims createPortal onto react-dom and unwraps the thunk', () => {
		const fixture = join(root, 'p.tsrx');
		writeFileSync(fixture, 'src');
		compileReactFixture(fixture, {
			...cfg(),
			fixtureDir: root,
			deps: {
				compile: () => ({
					code: `import { createPortal, useState } from "octane";`,
				}),
				transform: (code) => ({ code }),
			},
		});
		const out = readFileSync(join(root, '.react-cache', fixtureCacheName(fixture)), 'utf8');
		expect(out).toContain(`from "react-dom"`);
		expect(out).toContain(`typeof children === "function" ? children() : children`);
		expect(out).toContain(`import { useState } from "react";`);
	});

	it('rewrites xlink:href to the React-19 round-trippable form', () => {
		const fixture = join(root, 'x.tsrx');
		writeFileSync(fixture, 'src');
		compileReactFixture(fixture, {
			...cfg(),
			fixtureDir: root,
			deps: {
				compile: () => ({ code: `const p = { "xlink:href": v };` }),
				transform: (code) => ({ code }),
			},
		});
		const out = readFileSync(join(root, '.react-cache', fixtureCacheName(fixture)), 'utf8');
		expect(out).toBe(`const p = { xlinkHref: v };`);
	});

	it('skips compile failures with onError: skip — octane-only fixture dirs', () => {
		const fixture = join(root, 'bad.tsrx');
		writeFileSync(fixture, 'src');
		const result = compileReactFixture(fixture, {
			...cfg(),
			fixtureDir: root,
			onError: 'skip',
			deps: { compile: () => ({ code: '', errors: ['boom'] }), transform: okDeps.transform },
		});
		expect(result).toBe('skipped');
		expect(existsSync(join(root, '.react-cache', fixtureCacheName(fixture)))).toBe(false);
	});

	it('throws on compile failures in walk mode by default', () => {
		const fixture = join(root, 'bad.tsrx');
		writeFileSync(fixture, 'src');
		expect(() =>
			compileReactFixture(fixture, {
				...cfg(),
				fixtureDir: root,
				deps: { compile: () => ({ code: '', errors: ['boom'] }), transform: okDeps.transform },
			}),
		).toThrow(/compilation failed/);
	});

	it('throws on compile failures in declared mode — a stale oracle must never compare', () => {
		const fixture = join(root, 'bad.tsrx');
		writeFileSync(fixture, 'src');
		expect(() =>
			compileReactFixture(fixture, {
				...cfg(),
				fixtureDir: root,
				fixtures: ['bad.tsrx'],
				deps: { compile: () => ({ code: '', errors: ['boom'] }), transform: okDeps.transform },
			}),
		).toThrow(/compilation failed/);
	});

	it('throws on transform failures in declared mode', () => {
		const fixture = join(root, 'bad.tsrx');
		writeFileSync(fixture, 'src');
		expect(() =>
			compileReactFixture(fixture, {
				...cfg(),
				fixtureDir: root,
				fixtures: ['bad.tsrx'],
				deps: {
					compile: okDeps.compile,
					transform: () => {
						throw new Error('esbuild broke');
					},
				},
			}),
		).toThrow(/transform failed/);
	});
});

describe('differentialSetup', () => {
	it('walks nested fixture dirs in all mode', async () => {
		mkdirSync(join(root, '_fixtures', 'nested'), { recursive: true });
		writeFileSync(join(root, '_fixtures', 'a.tsrx'), 'a');
		writeFileSync(join(root, '_fixtures', 'nested', 'b.tsrx'), 'b');
		writeFileSync(join(root, '_fixtures', 'ignored.ts'), 'x');
		const { setup } = differentialSetup(cfg());
		await setup();
		const out = readdirSync(join(root, '.react-cache'));
		expect(out).toHaveLength(2);
	});

	it('compiles only the declared list in declared mode', async () => {
		mkdirSync(join(root, '_fixtures'), { recursive: true });
		writeFileSync(join(root, '_fixtures', 'a-diff.tsrx'), 'a');
		writeFileSync(join(root, '_fixtures', 'internal.tsrx'), 'x');
		const { setup } = differentialSetup(cfg({ fixtures: ['a-diff.tsrx'] }));
		await setup();
		expect(readdirSync(join(root, '.react-cache'))).toEqual([
			fixtureCacheName(join(root, '_fixtures', 'a-diff.tsrx')),
		]);
	});

	it('rebuilds the cache from scratch — stale entries cannot survive', async () => {
		mkdirSync(join(root, '_fixtures'), { recursive: true });
		writeFileSync(join(root, '_fixtures', 'a.tsrx'), 'a');
		mkdirSync(join(root, '.react-cache'), { recursive: true });
		writeFileSync(join(root, '.react-cache', 'stale-0.js'), 'old');
		const { setup } = differentialSetup(cfg());
		await setup();
		const out = readdirSync(join(root, '.react-cache'));
		expect(out).toHaveLength(1);
		expect(out[0]).not.toBe('stale-0.js');
	});

	it('throws when the fixture dir is missing by default, returns quietly with onError: skip', async () => {
		await expect(differentialSetup(cfg()).setup()).rejects.toThrow(/fixture dir not found/);
		await differentialSetup(cfg({ onError: 'skip' })).setup();
	});
});
