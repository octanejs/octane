#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { immutableTestInventory } from '../../../scripts/react-port/preflight-lib.mjs';
import { validateUpstreamCrosswalk } from '../../../scripts/react-port/evidence-lib.mjs';
import { verifyMaterializedAdaptedEvidence } from '../../../scripts/react-parity/materialized-upstream-lib.mjs';

const root = resolve(import.meta.dirname, '../../..');
const args = process.argv.slice(2);
const checkoutIndex = args.indexOf('--source-checkout');
const checkout = checkoutIndex < 0 ? null : args[checkoutIndex + 1];
if (!checkout || checkout.startsWith('--'))
	throw new Error('Supply --source-checkout <immutable Base UI git checkout>');
const check = args.includes('--check');

for (const name of ['base-ui', 'base-ui-utils']) {
	const packageRoot = resolve(root, `packages/${name}`);
	const lock = JSON.parse(readFileSync(resolve(packageRoot, 'audit/upstream.lock.json'), 'utf8'));
	if (lock.identity.commit !== '47b40521eab921c2756bf9bdb0b0f07fbfdb8c8c')
		throw new Error('Review the registration dispositions for the new upstream commit');
	const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'upstream/package.json'), 'utf8'));
	const provenance = {
		repo: 'https://github.com/mui/base-ui.git',
		version: lock.identity.version,
		commit: lock.identity.commit,
	};
	const mappedFiles = verifyMaterializedAdaptedEvidence(root, `packages/${name}`, provenance);
	const tree = execFileSync(
		'git',
		[
			'--no-replace-objects',
			'-C',
			resolve(checkout),
			'ls-tree',
			'-r',
			'-z',
			'-l',
			lock.identity.commit,
		],
		{ encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
	)
		.split('\0')
		.filter(Boolean)
		.map((line) => {
			const match = /^(\d+) (\S+) ([a-f0-9]{40})\s+(\d+|-)\t(.+)$/.exec(line);
			if (!match) throw new Error('Invalid immutable git tree entry');
			return {
				mode: match[1],
				type: match[2],
				sha: match[3],
				size: Number(match[4]),
				path: match[5],
			};
		});
	const subdirectory = name === 'base-ui' ? 'packages/react' : 'packages/utils';
	const inventory = await immutableTestInventory(tree, subdirectory, manifest, {
		sourceCommit: lock.identity.commit,
		sourceCheckout: resolve(checkout),
	});
	const registrations = [];
	const crosswalk = [];
	for (const file of inventory) {
		const relativePath = file.path.slice(subdirectory.length + 1);
		const mapping = lock.adaptedMappings.find(
			({ fromRoot, include }) =>
				relativePath.startsWith(`${fromRoot}/`) &&
				(!include || new RegExp(include).test(relativePath)),
		);
		if (!mapping) throw new Error(`Upstream test has no adaptation mapping: ${file.path}`);
		const localEvidence = `${mapping.toRoot}/${relativePath.slice(mapping.fromRoot.length + 1)}`;
		if (!mappedFiles.has(`packages/${name}/${localEvidence}`))
			throw new Error(`Upstream test is not verified materialized evidence: ${file.path}`);
		for (const registration of file.registrations) {
			// Exact immutable declarations retained as skipped adaptations. Other
			// registrations in these files still participate in conformance execution.
			const unsupported =
				/^packages\/react\/src\/internals\/useRenderElement\.test\.tsx:(531|550|563|584):/.test(
					registration.source,
				)
					? "React Server Components' private Flight format is not part of Octane's API."
					: [
								'src/checkbox/root/CheckboxRoot.react17.test.tsx',
								'src/otp-field/root/OTPFieldRoot.react17.test.tsx',
						  ].includes(relativePath)
						? 'Octane supplies useId natively and does not implement the React 17 missing-useId fallback.'
						: null;
			registrations.push({
				id: registration.id,
				source: registration.source,
				kind: registration.kind,
				title: registration.title ?? null,
			});
			crosswalk.push({
				id: registration.id,
				classification: unsupported ? 'unsupported' : 'conformance',
				localEvidence,
				...(unsupported ? { rationale: unsupported } : {}),
			});
		}
	}
	validateUpstreamCrosswalk(registrations, crosswalk, inventory, packageRoot);
	for (const [filename, value] of [
		['upstream-registrations.json', registrations],
		['registration-crosswalk.json', crosswalk],
	]) {
		const output = resolve(packageRoot, 'audit', filename);
		const bytes = await format(JSON.stringify(value), {
			...(await resolveConfig(output, { editorconfig: true })),
			filepath: output,
			parser: 'json',
		});
		if (check) {
			if (readFileSync(output, 'utf8') !== bytes) throw new Error(`${output} is stale`);
		} else writeFileSync(output, bytes);
	}
	console.log(
		`${name}: ${inventory.length} immutable test files, ${registrations.length} registrations`,
	);
}
