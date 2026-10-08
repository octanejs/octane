import { afterEach, describe, expect, it } from 'vitest';
import { parseSync, transformWithOxc } from 'vite';
import { foldProfileGuards } from '../../src/compiler/profile-guards.js';

// The dev server folds `__OCTANE_PROFILE_ENABLED__` out of Octane's runtime
// modules with profiling off. Each case runs a module as authored, with the
// define installed as the `false` global `vite dev` provides, and as folded,
// and expects the same results with no read of the define left.
const GUARD = `(typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)`;
const BARE_GUARD = `typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__`;
const profileGlobal = globalThis as typeof globalThis & { __OCTANE_PROFILE_ENABLED__?: boolean };

afterEach(() => {
	delete profileGlobal.__OCTANE_PROFILE_ENABLED__;
});

function parse(source: string) {
	const { program, errors } = parseSync('module.ts', source, {
		lang: 'ts',
		sourceType: 'module',
		preserveParens: true,
	});
	expect(errors).toEqual([]);
	return program;
}

function fold(source: string) {
	const folded = foldProfileGuards(source, parse(source), false);
	expect(folded).not.toBeNull();
	parse(folded!);
	// Removed code keeps its line breaks, so stack traces and breakpoints still
	// point at the authored lines without a source map.
	expect(folded!.split('\n')).toHaveLength(source.split('\n').length);
	expect(folded).not.toContain('__OCTANE_PROFILE_ENABLED__');
	return folded!;
}

async function load(source: string) {
	return import(/* @vite-ignore */ `data:text/javascript,${encodeURIComponent(source)}`);
}

async function expectSameResults(source: string, calls: unknown[][] = [[]]) {
	const folded = fold(source);
	profileGlobal.__OCTANE_PROFILE_ENABLED__ = false;
	const authored = await load(source);
	delete profileGlobal.__OCTANE_PROFILE_ENABLED__;
	const served = await load(folded);
	for (const args of calls) expect(served.result(...args)).toEqual(authored.result(...args));
}

describe('dev-server profiling guard folding', () => {
	it('keeps a returned branch on the return line', async () => {
		await expectSameResults(`export function result() {
	return typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' &&
		__OCTANE_PROFILE_ENABLED__
		? 'profiled'
		: 'plain';
}
`);
	});

	it('keeps an object literal an expression where a block could start', async () => {
		await expectSameResults(`const object = () =>
	${BARE_GUARD} ? null : { kind: 'object' };
let seen = 'unset';
${BARE_GUARD} || { valueOf() { seen = 'kept'; } }.valueOf();
export function result() {
	return [object(), seen];
}
`);
	});

	it('still evaluates operands that run before the guard', async () => {
		await expectSameResults(
			`const log = [];
const block = { get disposed() { log.push('read'); return false; } };
export function result() {
	if (!block.disposed && ${BARE_GUARD}) log.push('profiled');
	else log.push('else');
	if (block.disposed || !${GUARD}) log.push('live');
	return log.splice(0);
}
`,
			[[], []],
		);
	});

	it('folds guards inside larger conditions and else-if chains', async () => {
		await expectSameResults(
			`export function result(value) {
	const out = [];
	if (!value || ${GUARD}) out.push('falsy');
	out.push(!${GUARD} && 'kept', value && ${GUARD});
	if (value === 1) out.push('one');
	else if (${BARE_GUARD}) out.push('profiled');
	else out.push('other');
	out.push(${GUARD} ? 'profiled' : value === 2 ? 'two' : 'neither');
	return out;
}
`,
			[[0], [1], [2]],
		);
	});

	it('removes the helpers and imports only profiling used', () => {
		const folded = fold(`import { trace } from './profiling.js';
import { keep } from './other.js';
function traced(value) {
	return trace(value);
}
function unused() {}
export function result(value) {
	if (${BARE_GUARD}) traced(value);
	return keep(value);
}
`);
		const program: any = parse(folded);
		const declarations = program.body.flatMap((node: any) =>
			node.type === 'ImportDeclaration'
				? [node.source.value]
				: node.type === 'FunctionDeclaration'
					? [node.id?.name]
					: node.type === 'ExportNamedDeclaration' &&
						  node.declaration?.type === 'FunctionDeclaration'
						? [node.declaration.id?.name]
						: [],
		);
		// A helper that was already unused is not this pass's to remove.
		expect(declarations).toEqual(['./other.js', 'unused', 'result']);
	});

	it('leaves TypeScript declarations and types in place', async () => {
		const source = `declare const __OCTANE_PROFILE_ENABLED__: boolean;
type Enabled = typeof __OCTANE_PROFILE_ENABLED__;
export const result = (): Enabled => ${BARE_GUARD};
`;
		const folded = foldProfileGuards(source, parse(source), false)!;
		expect(folded.match(/__OCTANE_PROFILE_ENABLED__/g)).toHaveLength(2);
		const { code } = await transformWithOxc(folded, 'module.ts');
		expect(code).not.toContain('__OCTANE_PROFILE_ENABLED__');
		expect((await load(code)).result()).toBe(false);
	});

	it('leaves a module alone when the name is a local binding', () => {
		const source = `const __OCTANE_PROFILE_ENABLED__ = true;
export const result = () => ${BARE_GUARD};
`;
		expect(foldProfileGuards(source, parse(source), false)).toBeNull();
	});
});
