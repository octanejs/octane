import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';

const FIXTURE = 'packages/octane/tests/_fixtures/style-ref.tsrx';

function compiledFunction(code: string, name: string): string {
	const start = code.indexOf('function ' + name);
	expect(start).toBeGreaterThan(-1);
	const nextExport = code.indexOf('\nexport ', start + 1);
	return code.slice(start, nextExport === -1 ? start + 4000 : nextExport);
}

describe('style-block ref compile shape', function () {
	it('emits parseable JS when unbraced switch cases each write the class map', function () {
		const source = readFileSync(FIXTURE, 'utf8');
		const { code } = compile(source, 'style-ref.tsrx');
		const fn = compiledFunction(code, 'SwitchReturnStyleRef');
		expect(fn).toContain("case 'a'");
		expect(fn).toContain('default:');
		expect(function () {
			new Function(fn);
		}).not.toThrow();
	});
});
