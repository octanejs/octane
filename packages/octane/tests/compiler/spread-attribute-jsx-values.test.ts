// @vitest-environment node

import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';

// JSX nested anywhere in a spread attribute lowers like any other value-position
// JSX. A bundler parses the compiled module as plain JavaScript, so leftover JSX
// fails the build. `../spread-attribute-jsx-values.test.ts` renders the fixture.

const FIXTURE = readFileSync(
	'packages/octane/tests/_fixtures/spread-attribute-jsx-values.tsrx',
	'utf8',
);
const TSX = `/** @jsxImportSource octane */
function Label(props: { n: number }) {
	return <b>{String(props.n)}</b>;
}
function View(props: { render?: (n: number) => unknown }) {
	return <div>{props.render?.(1) as any}</div>;
}
export function App(props: { cond: boolean }) {
	return (
		<section>
			<View {...{ render: (n: number) => <Label n={n} /> }} />
			<View {...(props.cond ? { render: (n: number) => <Label n={n} /> } : {})} />
		</section>
	);
}`;

describe('JSX values in spread attributes', () => {
	describe.each([
		['spread-attribute-jsx-values.tsrx', FIXTURE],
		['spread-attribute-jsx-values.tsx', TSX],
	])('%s', (file, source) => {
		it.each([
			['client', true],
			['client', false],
			['server', true],
			['server', false],
		] as const)('compiles to JavaScript with no JSX (%s, dev: %s)', (mode, dev) => {
			const { code } = compile(source, file, { mode, dev, hmr: false });
			expect(() => transformSync(code, { loader: 'js' })).not.toThrow();
		});
	});
});
