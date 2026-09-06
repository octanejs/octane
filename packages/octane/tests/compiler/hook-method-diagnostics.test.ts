import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { slotHooks } from '../../src/compiler/slot-hooks.js';

const source = readFileSync(
	resolve(import.meta.dirname, '../_fixtures/compiler-async-method-hook.ts'),
	'utf8',
);

describe.each([false, true])('method hook evaluation boundaries (inline=%s)', (inlineHookMemo) => {
	for (const environment of ['client', 'server'] as const) {
		it.each([
			source,
			source.replace('store.useValue(await input)', 'store?.useValue().read(await input)'),
			source.replace('store.useValue(await input)', 'store.useValue?.(await input).value'),
			source.replace('store.useValue(await input)', '(await input).useValue()'),
			source.replace('async function', 'function*').replace('await input', 'yield input'),
		])(
			`reports a suspended method expression before emitting invalid ${environment} JavaScript`,
			(code) => {
				expect(() =>
					slotHooks(code, 'method.ts', { inlineHookMemo, environment, dev: false }),
				).toThrow(/hook method.*await or yield/i);
			},
		);
		it(`allows async callbacks passed as arguments in ${environment}`, () => {
			const code = source.replace(
				'store.useValue(await input)',
				'store.useValue(async () => await input)',
			);
			expect(() =>
				slotHooks(code, 'method.ts', { inlineHookMemo, environment, dev: false }),
			).not.toThrow();
		});
		it(`preserves manual ownership in ${environment}`, () => {
			expect(() =>
				slotHooks(source, 'method.ts', { inlineHookMemo, environment, manualSlots: true }),
			).not.toThrow();
		});
	}
});
