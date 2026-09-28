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
	assert.match(generated.client, /declare const process: \{ env: \{ NODE_ENV\?: string \} \};/);
	assert.doesNotMatch(generated.client, /^\/\/.*process\.env\.NODE_ENV/m);
	assert.doesNotMatch(generated.server, /declare const process/);
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

test('enforces coded messages in covered signal, hydration, and DOM binding modules', () => {
	const shared = catalog({
		codes: {
			1: {
				message: 'Expected %s.',
				argumentCount: 1,
				runtime: ['client', 'server'],
				status: 'active',
			},
		},
	});
	const coded = 'throw new TypeError(formatClientError(1, value));';
	for (const filename of ['signals/engine.ts', 'hydration/stream-delivery.ts']) {
		assert.doesNotThrow(() => validateRuntimeUsages(shared, [[filename, coded]]));
		assert.throws(
			() =>
				validateRuntimeUsages(shared, [
					[filename, `${coded} throw new Error('An uncatalogued framework failure.');`],
				]),
			/constructs Error without a direct formatClientError/,
		);
	}
	// Shared modules also load in SSR bundles, so their codes must exist on both surfaces.
	assert.throws(
		() => validateRuntimeUsages(catalog(), [['signals/engine.ts', coded]]),
		/which is not registered for server/,
	);
	assert.throws(
		() =>
			validateRuntimeUsages(shared, [
				['signals/engine.ts', `${coded} void formatServerError(1, value);`],
			]),
		/cannot use the server formatter in the shared runtime/,
	);
	// Client-only DOM binding modules use client-only codes.
	assert.doesNotThrow(() => validateRuntimeUsages(catalog(), [['dom-bindings.ts', coded]]));
	assert.throws(
		() =>
			validateRuntimeUsages(catalog(), [
				['dom-binding-program.ts', `${coded} throw new RangeError(\`Bad \${value}.\`);`],
			]),
		/constructs RangeError without a direct formatClientError/,
	);
	// Modules outside the covered set are not framework error surfaces.
	assert.throws(
		() => validateRuntimeUsages(catalog(), [['data-encoding.ts', coded]]),
		/has no runtime call site/,
	);

	// Error subclasses: forwarded messages are checked at each construction and
	// self-formatted messages at super().
	const forwarding =
		'export class SignalFrameError extends Error { constructor(message: string) { super(message); } }';
	assert.doesNotThrow(() =>
		validateRuntimeUsages(shared, [
			['signals/errors.ts', forwarding],
			['signals/engine.ts', 'throw new SignalFrameError(formatClientError(1, key));'],
		]),
	);
	assert.throws(
		() =>
			validateRuntimeUsages(shared, [
				['signals/errors.ts', forwarding],
				['signals/engine.ts', `${coded} throw new SignalFrameError('Unknown signal.');`],
			]),
		/constructs SignalFrameError without a direct formatClientError/,
	);
	assert.throws(
		() =>
			validateRuntimeUsages(shared, [
				[
					'hydration/stream-result-receiver.ts',
					`${coded} class ReceiverError extends Error { constructor(readonly code: string, message: string) { super(message); } } throw new ReceiverError('protocol', 'Malformed frame.');`,
				],
			]),
		/constructs ReceiverError without a direct formatClientError/,
	);
	assert.throws(
		() =>
			validateRuntimeUsages(shared, [
				[
					'signals/errors.ts',
					`${coded} export class SignalIdleError extends Error { constructor(key: string) { super(\`Signal "\${key}" has no value.\`); } }`,
				],
			]),
		/constructs Error via super\(\) without a direct formatClientError/,
	);
	assert.doesNotThrow(() =>
		validateRuntimeUsages(shared, [
			[
				'signals/errors.ts',
				'export class SignalIdleError extends Error { constructor(key: string) { super(formatClientError(1, key)); } } throw new SignalIdleError(key);',
			],
		]),
	);

	// The narrow allowed shapes: coded alternatives, a caught foreign error's own
	// message, and a compiler-emitted construction reason.
	const shapes = catalog({
		nextCode: 3,
		codes: {
			1: { message: 'First.', argumentCount: 0, runtime: ['client'], status: 'active' },
			2: { message: 'Second.', argumentCount: 0, runtime: ['client'], status: 'active' },
		},
	});
	for (const message of [
		'flag ? formatClientError(1) : formatClientError(2)',
		'cause instanceof Error ? cause.message : formatClientError(1)',
		'definition.constructionError ?? formatClientError(1)',
	]) {
		assert.doesNotThrow(() =>
			validateRuntimeUsages(shapes, [
				['dom-bindings.ts', `throw new Error(${message}); void formatClientError(2);`],
			]),
		);
	}
	for (const message of [
		"flag ? formatClientError(1) : 'Second.'",
		'cause instanceof Error ? other.message : formatClientError(1)',
		'cause instanceof Error ? cause.stack : formatClientError(1)',
		'definition.reason ?? formatClientError(1)',
	]) {
		assert.throws(
			() =>
				validateRuntimeUsages(shapes, [
					['dom-bindings.ts', `throw new Error(${message}); void formatClientError(2);`],
				]),
			/constructs Error without a direct formatClientError/,
		);
	}
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
