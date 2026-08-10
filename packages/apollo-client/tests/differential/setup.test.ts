import { describe, expect, it, vi } from 'vitest';
import { compileFixture } from './fixture-compiler.mjs';

function dependencies(compile) {
	return {
		readFile: vi.fn(function readFile() {
			return 'fixture source';
		}),
		compile: vi.fn(compile),
		transform: vi.fn(function transform() {
			return { code: 'compiled' };
		}),
		writeFile: vi.fn(),
	};
}

describe('Apollo differential setup', function () {
	it('fails closed when the TSRX compiler reports errors', function () {
		const deps = dependencies(function compile() {
			return { code: '', errors: [{ message: 'invalid fixture' }] };
		});
		expect(function () {
			compileFixture('/fixtures/broken.tsrx', '/cache', deps);
		}).toThrow(/invalid fixture/);
		expect(deps.transform).not.toHaveBeenCalled();
		expect(deps.writeFile).not.toHaveBeenCalled();
	});

	it('propagates compiler exceptions without writing cache output', function () {
		const deps = dependencies(function compile() {
			throw new Error('compiler exploded');
		});
		expect(function () {
			compileFixture('/fixtures/broken.tsrx', '/cache', deps);
		}).toThrow('compiler exploded');
		expect(deps.writeFile).not.toHaveBeenCalled();
	});

	it('fails closed when rewrite leaves Octane-only imports', function () {
		const deps = dependencies(function compile() {
			return { code: 'export {}' };
		});
		deps.transform = vi.fn(function transform() {
			return {
				code: 'import { render } from "@octanejs/testing-library";\nexport {}',
			};
		});
		expect(function () {
			compileFixture('/fixtures/bad.tsrx', '/cache', deps);
		}).toThrow(/Octane-only imports/);
		expect(deps.writeFile).not.toHaveBeenCalled();
	});
});
