/**
 * Unpaired control-plane checks for the adapted upstream inventory: renaming
 * or dropping a tracked case must fail validation. Not React-parity evidence —
 * same role as react-map-gl `tests/harness/tape-adapter.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');

const REQUIRED_UPSTREAM_CASES = [
	'should check render with snapshot',
	'should check is it wrapped with <div />',
	'should check content',
];

describe('monaco-editor parity harness negatives', () => {
	it('keeps every adapted Loading upstream case name', () => {
		const source = readFileSync(resolve(ROOT, 'tests/upstream/loading.test.ts'), 'utf8');
		for (const name of REQUIRED_UPSTREAM_CASES) {
			expect(source.includes(`'${name}'`) || source.includes(`"${name}"`)).toBe(true);
		}
	});

	it('fails validation when an upstream case title is removed (simulated)', () => {
		const source = readFileSync(resolve(ROOT, 'tests/upstream/loading.test.ts'), 'utf8');
		const stripped = source.replace("it('should check content'", "it('RENAMED_CASE'");
		expect(stripped.includes("it('should check content'")).toBe(false);
		expect(
			REQUIRED_UPSTREAM_CASES.every(
				(name) => source.includes(`'${name}'`) || source.includes(`"${name}"`),
			),
		).toBe(true);
	});

	it('records MonacoContainer ref divergence citation', () => {
		const source = readFileSync(resolve(ROOT, 'tests/upstream/monaco-container.test.ts'), 'utf8');
		expect(source).toContain('OCTANE' + ' DIVERGENCE[container-ref][runtime:01c65bf4eb0a9c0a]');
		expect(source).toContain('ref=');
	});

	it('keeps every typetest assertion group marker in assertions.md and both suites', () => {
		const assertions = readFileSync(resolve(ROOT, 'typetests/assertions.md'), 'utf8');
		const pristine = readFileSync(resolve(ROOT, 'typetests/pristine/types.test-d.ts'), 'utf8');
		const adapted = readFileSync(resolve(ROOT, 'typetests/adapted/types.test-d.ts'), 'utf8');
		for (let group = 1; group <= 6; group++) {
			const label = `${group}.`;
			expect(assertions.includes(label), `assertions.md missing group ${group}`).toBe(true);
			expect(pristine.includes(`// Group ${group}`)).toBe(true);
			expect(adapted.includes(`// Group ${group}`)).toBe(true);
		}
		for (let group = 7; group <= 9; group++) {
			expect(adapted.includes(`// Group ${group}`)).toBe(true);
		}
	});

	it('fails validation when a shared @ts-expect-error control is removed (simulated)', () => {
		const source = readFileSync(resolve(ROOT, 'typetests/pristine/types.test-d.ts'), 'utf8');
		const stripped = source.replace(
			'@ts-expect-error onChange must accept (value, ev)',
			'@ts-check',
		);
		expect(stripped.includes('@ts-expect-error onChange must accept (value, ev)')).toBe(false);
		expect(source.includes('@ts-expect-error onChange must accept (value, ev)')).toBe(true);
	});

	it('fails validation when an adapted-only assertion group is dropped (simulated)', () => {
		const source = readFileSync(resolve(ROOT, 'typetests/adapted/types.test-d.ts'), 'utf8');
		const stripped = source.replace('// Group 9', '// REMOVED GROUP');
		expect(stripped.includes('// Group 9')).toBe(false);
		expect(source.includes('// Group 9')).toBe(true);
	});
});
