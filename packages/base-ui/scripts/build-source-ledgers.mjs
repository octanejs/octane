#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { inspectShippedSources } from '../../../scripts/react-port/evidence-lib.mjs';

const root = resolve(import.meta.dirname, '../../..');
const check = process.argv.includes('--check');

for (const name of ['base-ui', 'base-ui-utils']) {
	const packageRoot = resolve(root, 'packages', name);
	const upstreamPackage = name === 'base-ui' ? '@base-ui/react' : '@base-ui/utils';
	const shipped = inspectShippedSources(packageRoot);
	const sourceLedger = shipped.files.map((path) => ({
		path,
		// Native source and its compiled output retain upstream attribution.
		// package.json is the Octane package's authored export/build manifest.
		origin: path === 'package.json' ? 'authored' : 'adapted',
		sha256: createHash('sha256')
			.update(readFileSync(resolve(packageRoot, path)))
			.digest('hex'),
		...(path === 'package.json' ? {} : { packageName: upstreamPackage }),
	}));
	const output = resolve(packageRoot, 'audit/shipped-source-closure.json');
	const bytes = await format(
		JSON.stringify({
			runtimeDependencies: shipped.runtimeDependencies,
			adaptedSources: [
				{
					packageName: upstreamPackage,
					paths: sourceLedger
						.filter((entry) => entry.origin === 'adapted')
						.map((entry) => entry.path),
				},
			],
			sourceLedger,
			reimplementedDependencies:
				name === 'base-ui'
					? [
							{
								packageName: '@floating-ui/react-dom',
								publicBehaviors: [
									'Anchor positioning and popup placement use the existing native Octane floating primitive.',
								],
								localEvidence: [
									'tests/differential/parity.test.ts',
									'tests/popover.test.ts',
									'tests/tooltip.test.ts',
								],
							},
							{
								packageName: 'use-sync-external-store',
								publicBehaviors: [
									'Use the server hydration snapshot, switch to the client snapshot after commit, and render popup-store updates through native subscriptions.',
								],
								localEvidence: [
									'tests/ssr/ssr.test.ts',
									'tests/hydration.test.ts',
									'tests/differential/parity.test.ts',
								],
							},
						]
					: [
							{
								packageName: 'use-sync-external-store',
								publicBehaviors: [
									'Native store subscriptions render the latest values of every selector after consecutive updates.',
								],
								localEvidence: ['tests/fast-store.test.tsrx'],
							},
						],
		}),
		{
			...(await resolveConfig(output, { editorconfig: true })),
			filepath: output,
			parser: 'json',
		},
	);
	if (check) {
		if (readFileSync(output, 'utf8') !== bytes)
			throw new Error(`${output} is stale; rebuild packages and regenerate`);
	} else writeFileSync(output, bytes);
	console.log(
		`${name}: ${sourceLedger.length} reachable shipped files, ${shipped.runtimeDependencies.length} dependencies`,
	);
}
