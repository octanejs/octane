import { describe, expect, it } from 'vitest';
import { PACKAGE_MANAGERS, installCommand } from '../src/kernel/install.js';

/**
 * @param {string | null} packageManager
 */
const project = (packageManager) => /** @type {any} */ ({ packageManager });

describe('installCommand', () => {
	it('spells the command the way each manager does', () => {
		// `npm install` and `pnpm add` are not interchangeable, and a manager that
		// falls through to npm's spelling fails rather than installing.
		expect(installCommand(project('npm'), ['octane'])).toEqual({
			manager: 'npm',
			args: ['install', 'octane'],
		});
		expect(installCommand(project('pnpm'), ['octane'], true)).toEqual({
			manager: 'pnpm',
			args: ['add', '-D', 'octane'],
		});
	});

	it('installs with npm when the project says nothing', () => {
		expect(installCommand(project(null), ['octane']).manager).toBe('npm');
	});

	it('knows how to drive every manager it offers', () => {
		// The offered set and the spellings are one list, so this holds by
		// construction. It is asserted because the two were separate copies once,
		// and a manager offered by a flag but missing a spelling would install
		// through npm without saying so.
		for (const manager of PACKAGE_MANAGERS) {
			expect(installCommand(project(manager), ['octane']).manager, manager).toBe(manager);
		}
	});
});
