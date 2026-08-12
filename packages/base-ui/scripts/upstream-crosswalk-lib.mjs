import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ADAPTED_ARTIFACTS = new Map([
	[
		'packages/react/src/accordion/root/AccordionRoot.test.tsx',
		'packages/base-ui/tests/upstream/accordion.test.ts',
	],
	[
		'packages/react/src/accordion/trigger/AccordionTrigger.test.tsx',
		'packages/base-ui/tests/upstream/accordion.test.ts',
	],
	[
		'packages/react/src/accordion/panel/AccordionPanel.test.tsx',
		'packages/base-ui/tests/upstream/accordion.test.ts',
	],
	[
		'packages/react/src/collapsible/root/CollapsibleRoot.test.tsx',
		'packages/base-ui/tests/upstream/collapsible.test.ts',
	],
	[
		'packages/react/src/collapsible/trigger/CollapsibleTrigger.test.tsx',
		'packages/base-ui/tests/upstream/collapsible.test.ts',
	],
	[
		'packages/react/src/collapsible/panel/CollapsiblePanel.test.tsx',
		'packages/base-ui/tests/upstream/collapsible.test.ts',
	],
	[
		'packages/react/src/tabs/root/TabsRoot.test.tsx',
		'packages/base-ui/tests/upstream/tabs.test.ts',
	],
	[
		'packages/react/src/tabs/list/TabsList.test.tsx',
		'packages/base-ui/tests/upstream/tabs.test.ts',
	],
	['packages/react/src/tabs/tab/TabsTab.test.tsx', 'packages/base-ui/tests/upstream/tabs.test.ts'],
	[
		'packages/react/src/tabs/panel/TabsPanel.test.tsx',
		'packages/base-ui/tests/upstream/tabs.test.ts',
	],
]);

function walk(root) {
	const files = [];
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		const path = join(root, entry.name);
		if (entry.isDirectory()) files.push(...walk(path));
		else if (entry.isFile()) files.push(path);
	}
	return files;
}

export function buildUpstreamCrosswalk(upstreamRoot, repoRoot) {
	const packageJson = JSON.parse(
		readFileSync(join(upstreamRoot, 'packages/react/package.json'), 'utf8'),
	);
	const publicSubpaths = Object.keys(packageJson.exports)
		.filter((key) => key !== '.' && key !== './types' && !key.startsWith('./internals/'))
		.sort();
	const surface = publicSubpaths.map((subpath) => {
		const name = subpath.slice(2);
		const octanePath = `packages/base-ui/src/${name}.ts`;
		return existsSync(resolve(repoRoot, octanePath))
			? [
					subpath,
					'surface-present-unverified',
					`${octanePath} exists; behavior remains bounded by the recorded-unverified manifest lanes.`,
				]
			: [subpath, 'gap', `${octanePath} is not implemented at this pin.`];
	});

	const upstreamArtifacts = [
		...walk(join(upstreamRoot, 'packages/react/src')).filter((file) =>
			/\.(?:test|spec)\.(?:ts|tsx)$/.test(file),
		),
		...walk(join(upstreamRoot, 'packages/react/test')),
	]
		.map((file) => {
			const path = relative(upstreamRoot, file).split('\\').join('/');
			const kind = path.startsWith('packages/react/test/')
				? 'support'
				: /\.spec\.(?:ts|tsx)$/.test(path)
					? 'type-test'
					: /\.test\.(?:ts|tsx)$/.test(path)
						? 'runtime-test'
						: 'support';
			const adaptedPath = ADAPTED_ARTIFACTS.get(path);
			if (adaptedPath) return [path, kind, 'partially-adapted', adaptedPath];
			return [path, kind, kind === 'support' ? 'vendored-support' : 'not-adapted'];
		})
		.sort((a, b) => a[0].localeCompare(b[0]));

	return {
		schemaVersion: 1,
		provenance: {
			repository: 'https://github.com/mui/base-ui.git',
			tag: 'v1.6.0',
			commit: 'b34551d644f2e58ebf8fc1050d949f6654ceca6c',
		},
		surface,
		artifactEvidence: {
			'partially-adapted': 'Selected cases are transcribed in the recorded local evidence file.',
			'not-adapted':
				'The vendored canonical runtime/type suite is inventoried but is not adapted case-by-case.',
			'vendored-support':
				'The byte-exact support artifact is retained under packages/base-ui/upstream.',
		},
		upstreamArtifacts,
		summary: {
			publicSubpaths: surface.length,
			surfacePresentUnverified: surface.filter((entry) => entry[1] === 'surface-present-unverified')
				.length,
			gapSubpaths: surface.filter((entry) => entry[1] === 'gap').length,
			upstreamArtifacts: upstreamArtifacts.length,
			runtimeTests: upstreamArtifacts.filter((entry) => entry[1] === 'runtime-test').length,
			typeTests: upstreamArtifacts.filter((entry) => entry[1] === 'type-test').length,
			supportArtifacts: upstreamArtifacts.filter((entry) => entry[1] === 'support').length,
			partiallyAdaptedArtifacts: upstreamArtifacts.filter(
				(entry) => entry[2] === 'partially-adapted',
			).length,
		},
	};
}
