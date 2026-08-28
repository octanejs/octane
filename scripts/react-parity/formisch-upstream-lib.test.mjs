import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { compareAdaptedReactFile } from './formisch-upstream-lib.mjs';

const upstream = `
import { test } from 'vitest';
test('keeps the value', () => {});
`;

test('accepts a one-for-one active adapted case', () => {
	assert.equal(compareAdaptedReactFile(upstream, upstream, 'example.test.tsx'), 1);
});

test('rejects a renamed adapted case', () => {
	assert.throws(
		() =>
			compareAdaptedReactFile(
				upstream,
				upstream.replace('keeps the value', 'renamed'),
				'example.test.tsx',
			),
		/case registrations drifted/,
	);
});

test('rejects a skipped adapted case', () => {
	assert.throws(
		() =>
			compareAdaptedReactFile(
				upstream,
				upstream.replace("test('", "test.skip('"),
				'example.test.tsx',
			),
		/focused, skipped, failing, or todo/,
	);
});

test('rejects a removed adapted case', () => {
	assert.throws(
		() => compareAdaptedReactFile(upstream, '', 'example.test.tsx'),
		/case registrations drifted/,
	);
});

test('rejects deleting an adapted assertion without changing its case name', () => {
	const asserted = upstream.replace('() => {}', "() => { expect('value').toBe('value'); }");
	assert.throws(
		() => compareAdaptedReactFile(asserted, upstream, 'example.test.tsx'),
		/assertions drifted/,
	);
});

test('rejects replacing an adapted matcher without changing its case name', () => {
	const asserted = upstream.replace('() => {}', "() => { expect('value').toBe('value'); }");
	assert.throws(
		() =>
			compareAdaptedReactFile(
				asserted,
				asserted.replace("toBe('value')", "toEqual('value')"),
				'example.test.tsx',
			),
		/assertions drifted/,
	);
});

test('rejects changing an adapted expectation operand', () => {
	const asserted = upstream.replace('() => {}', "() => { expect('value').toBe('value'); }");
	assert.throws(
		() =>
			compareAdaptedReactFile(
				asserted,
				asserted.replace("toBe('value')", "toBe('changed')"),
				'example.test.tsx',
			),
		/assertions drifted/,
	);
});

test('rejects moving an adapted assertion between cases', () => {
	const asserted = `${upstream.replace('() => {}', "() => { expect('value').toBe('value'); }")}\ntest('keeps another value', () => {});\n`;
	const moved = asserted
		.replace("() => { expect('value').toBe('value'); }", '() => {}')
		.replace(
			"test('keeps another value', () => {})",
			"test('keeps another value', () => { expect('value').toBe('value'); })",
		);
	assert.throws(
		() => compareAdaptedReactFile(asserted, moved, 'example.test.tsx'),
		/assertions drifted/,
	);
});

test('rejects changing an adapted action while preserving every expectation', () => {
	const source = upstream.replace(
		'() => {}',
		"() => { fireEvent.click(button); expect('value').toBe('value'); }",
	);
	const adapted = source.replace('fireEvent.click(button)', 'button.click()');
	const sha256 = (value) => createHash('sha256').update(value).digest('hex');
	assert.throws(
		() =>
			compareAdaptedReactFile(source, adapted, 'example.test.tsx', {
				upstreamSha256: sha256(source),
				adaptedSha256: sha256(source),
			}),
		/source fingerprint drifted/,
	);
});
