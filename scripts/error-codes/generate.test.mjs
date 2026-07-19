import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	generateFiles,
	validateCatalog,
	validateCatalogCompatibility,
	validateRuntimeUsages,
} from './generate.mjs';

function catalog(overrides = {}) {
	return {
		schemaVersion: 1,
		nextCode: 2,
		codes: {
			1: {
				message: 'Expected %s.',
				argumentCount: 1,
				runtime: ['client'],
				status: 'active',
			},
		},
		...overrides,
	};
}

test('validates and generates surface-specific formatter cases', () => {
	const input = catalog({
		nextCode: 3,
		codes: {
			1: {
				message: 'Expected %s.',
				argumentCount: 1,
				runtime: ['client'],
				status: 'active',
			},
			2: {
				message: 'Shared failure.',
				argumentCount: 0,
				runtime: ['client', 'server'],
				status: 'active',
			},
		},
	});
	const generated = generateFiles(input);
	assert.match(generated.client, /case 1:/);
	assert.match(generated.client, /case 2:/);
	assert.doesNotMatch(generated.server, /case 1:/);
	assert.match(generated.server, /case 2:/);
});

test('rejects placeholder drift, duplicate messages, and reused next codes', () => {
	assert.throws(
		() =>
			validateCatalog(
				catalog({
					codes: {
						1: {
							message: 'Expected %s.',
							argumentCount: 0,
							runtime: ['client'],
							status: 'active',
						},
					},
				}),
			),
		/contains 1 %s placeholders/,
	);
	assert.throws(
		() =>
			validateCatalog(
				catalog({
					nextCode: 3,
					codes: {
						1: {
							message: 'Duplicate.',
							argumentCount: 0,
							runtime: ['client'],
							status: 'active',
						},
						2: {
							message: 'Duplicate.',
							argumentCount: 0,
							runtime: ['server'],
							status: 'active',
						},
					},
				}),
			),
		/ same active message/,
	);
	assert.throws(() => validateCatalog(catalog({ nextCode: 1 })), /must be greater/);
});

test('requires every active surface code to have a valid literal call site', () => {
	const input = catalog();
	assert.doesNotThrow(() =>
		validateRuntimeUsages(input, [['runtime.ts', 'throw Error(formatClientError(1, value));']]),
	);
	assert.throws(() => validateRuntimeUsages(input, []), /has no runtime call site/);
	assert.throws(
		() =>
			validateRuntimeUsages(input, [
				['runtime.server.ts', 'throw Error(formatServerError(1, value));'],
			]),
		/not registered for server/,
	);
	assert.throws(
		() => validateRuntimeUsages(input, [['runtime.ts', 'void formatServerError(1, value);']]),
		/cannot use the server formatter in the client runtime/,
	);
	assert.throws(
		() => validateRuntimeUsages(input, [['runtime.ts', 'throw Error(formatClientError(2));']]),
		/references unknown client code 2/,
	);
	assert.throws(
		() =>
			validateRuntimeUsages(input, [
				['runtime.ts', 'throw new Error("uncatalogued"); void formatClientError(1);'],
			]),
		/constructs Error without a direct formatClientError/,
	);
	assert.throws(
		() =>
			validateRuntimeUsages(input, [
				['runtime.ts', '// formatClientError(1, value) is not a call site'],
			]),
		/has no runtime call site/,
	);
	assert.throws(
		() =>
			validateRuntimeUsages(input, [
				['runtime.ts', "throw new Error('unstripped prefix ' + formatClientError(1, value));"],
			]),
		/constructs Error without a direct formatClientError/,
	);
	assert.throws(
		() => validateRuntimeUsages(input, [['runtime.ts', 'throw new Error(formatClientError(1));']]),
		/passes 0 arguments to client code 1; expected 1/,
	);
	const transportCatalog = {
		schemaVersion: 1,
		nextCode: 24,
		codes: {
			23: {
				message: 'Server-rendered use() rejected',
				argumentCount: 0,
				runtime: ['client'],
				status: 'active',
			},
		},
	};
	assert.doesNotThrow(() =>
		validateRuntimeUsages(transportCatalog, [
			[
				'runtime.ts',
				"throw new Error(typeof payload.message === 'string' ? payload.message : formatClientError(23));",
			],
		]),
	);
	assert.throws(
		() =>
			validateRuntimeUsages(transportCatalog, [
				[
					'runtime.ts',
					"throw new Error(typeof payload.other === 'string' ? payload.other : formatClientError(23));",
				],
			]),
		/constructs Error without a direct formatClientError/,
	);
	assert.throws(
		() =>
			validateRuntimeUsages(input, [
				[
					'runtime.ts',
					"const full = 'unstripped'; throw new Error(false ? formatClientError(1, value) : full);",
				],
			]),
		/constructs Error without a direct formatClientError/,
	);
});

test('keeps published codes append-only while allowing retirement and additions', () => {
	const previous = catalog();
	const retiredAndExtended = catalog({
		nextCode: 3,
		codes: {
			1: { ...previous.codes[1], status: 'retired', runtime: ['client', 'server'] },
			2: {
				message: 'New failure.',
				argumentCount: 0,
				runtime: ['server'],
				status: 'active',
			},
		},
	});
	assert.doesNotThrow(() => validateCatalogCompatibility(previous, retiredAndExtended));

	for (const [change, expected] of [
		[{ codes: {} }, /cannot be deleted/],
		[
			{
				codes: {
					1: { ...previous.codes[1], message: 'Changed %s.' },
				},
			},
			/cannot change its message/,
		],
		[
			{
				codes: {
					1: { ...previous.codes[1], message: 'Expected %s %s.', argumentCount: 2 },
				},
			},
			/cannot change its argument shape/,
		],
		[
			{
				codes: {
					1: { ...previous.codes[1], runtime: ['server'] },
				},
			},
			/cannot drop its client runtime surface/,
		],
	]) {
		assert.throws(() => validateCatalogCompatibility(previous, catalog(change)), expected);
	}

	const retired = catalog({
		codes: { 1: { ...previous.codes[1], status: 'retired' } },
	});
	assert.throws(
		() => validateCatalogCompatibility(retired, previous),
		/retired code 1 cannot be reactivated/,
	);
	assert.throws(
		() => validateCatalogCompatibility(catalog({ nextCode: 3 }), previous),
		/nextCode cannot move backwards from 3 to 2/,
	);
	assert.throws(
		() =>
			validateCatalogCompatibility(
				catalog({ nextCode: 3 }),
				catalog({
					nextCode: 3,
					codes: {
						...previous.codes,
						2: {
							message: 'Reused failure.',
							argumentCount: 0,
							runtime: ['client'],
							status: 'active',
						},
					},
				}),
			),
		/new code 2 cannot reuse a number below the published nextCode 3/,
	);
});
