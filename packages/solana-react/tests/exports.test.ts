import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as root from '../src/index';
import * as query from '../src/query';

describe('public exports', () => {
	it('exposes the Octane seam and query subpath without an SWR surface', () => {
		expect(Object.keys(root).sort()).toEqual([
			'ClientContext',
			'ClientProvider',
			'TransactionFailure',
			'createClientStore',
			'createTransactionExecutor',
			'createWalletStore',
			'useClient',
			'useClientCapability',
		]);
		expect(Object.keys(query)).toEqual(['useRequestQuery']);
	});

	it('pins one exactly aligned stable v7 Solana package family', () => {
		const manifest = JSON.parse(
			readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8'),
		) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
		expect(manifest.dependencies['@solana/kit']).toBe('7.0.0');
		expect(manifest.devDependencies['@solana/react']).toBe('7.0.0');
	});
});
