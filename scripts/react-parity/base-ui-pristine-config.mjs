import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { verifyMaterializedUpstreamEvidence } from './materialized-upstream-lib.mjs';

// The repository-wide setup lives outside both npm package directories. Keep
// its original bytes and repository paths separately from package evidence.
export function verifyBaseUIRepositoryFixtures(repoRoot) {
	const root = resolve(repoRoot, 'packages/base-ui/audit/repository-fixtures');
	const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));
	for (const name of ['base-ui', 'base-ui-utils']) {
		const lock = JSON.parse(
			readFileSync(resolve(repoRoot, `packages/${name}/audit/upstream.lock.json`), 'utf8'),
		);
		if (lock.identity.commit !== manifest.commit)
			throw new Error('Base UI repository fixture commit mismatch');
		verifyMaterializedUpstreamEvidence(repoRoot, `packages/${name}`);
	}
	for (const file of manifest.files) {
		const bytes = readFileSync(resolve(root, file.path));
		const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
		const digest = createHash('sha256').update(bytes).digest('hex');
		if (blob !== file.gitBlob || digest !== file.sha256)
			throw new Error(`Base UI repository fixture changed: ${file.path}`);
	}
	return root;
}

export function baseUIPristineConfig(packageRoot, name) {
	const repoRoot = resolve(packageRoot, '../..');
	const repositoryFixtures = verifyBaseUIRepositoryFixtures(repoRoot);
	const runRoot = process.env.BASE_UI_PRISTINE_ROOT ?? resolve(packageRoot, 'upstream');
	const reactRoot = name === 'base-ui' ? runRoot : resolve(repoRoot, 'packages/base-ui/upstream');
	const utilsRoot =
		name === 'base-ui-utils' ? runRoot : resolve(repoRoot, 'packages/base-ui-utils/upstream');
	const require = createRequire(resolve(packageRoot, 'package.json'));
	process.env.TZ = 'UTC';
	return {
		root: packageRoot,
		cacheDir: resolve(packageRoot, '.pristine-vitest-cache'),
		define: { 'process.env.NODE_ENV': JSON.stringify('test') },
		test: {
			name: `${name}-pristine`,
			include: [
				resolve(runRoot, 'src/**/*.test.{ts,tsx}'),
				resolve(runRoot, 'test/**/*.test.{ts,tsx}'),
			],
			globals: true,
			environment: resolve(repoRoot, 'scripts/react-parity/base-ui-jsdom-environment.mjs'),
			environmentOptions: { jsdom: { pretendToBeVisual: true, url: 'http://localhost' } },
			setupFiles: [
				resolve(repoRoot, 'scripts/react-parity/base-ui-hook-order.ts'),
				resolve(repositoryFixtures, 'test/setupVitest.ts'),
			],
			server: { deps: { inline: ['@mui/internal-test-utils'] } },
		},
		plugins: [
			{
				name: 'base-ui-pristine-repository-paths',
				enforce: 'pre',
				resolveId(id, importer) {
					if (!id.startsWith('.') || !importer?.startsWith(repositoryFixtures + '/')) return;
					const target = resolve(dirname(importer), id);
					for (const [folder, root] of [
						['react', reactRoot],
						['utils', utilsRoot],
					]) {
						const prefix = resolve(repositoryFixtures, `packages/${folder}`);
						if (target.startsWith(prefix + '/'))
							return this.resolve(root + target.slice(prefix.length), importer, { skipSelf: true });
					}
				},
			},
		],
		resolve: {
			alias: [
				// The upstream helper's semver dependency can otherwise resolve a newer
				// simulator than this immutable checkout used, changing pointer events.
				{
					find: /^@testing-library\/user-event$/,
					replacement: require.resolve('@testing-library/user-event'),
				},
				{ find: /^@base-ui\/react(?:\/(.*))?$/, replacement: resolve(reactRoot, 'src') + '/$1' },
				{ find: /^@base-ui\/utils\/(.*)$/, replacement: resolve(utilsRoot, 'src') + '/$1' },
				{ find: '#test-utils', replacement: resolve(reactRoot, 'test/index.ts') },
				{
					find: '#formatErrorMessage',
					replacement: resolve(utilsRoot, 'src/formatErrorMessage.ts'),
				},
				{
					find: '#prehydration/tabs/indicator',
					replacement: resolve(reactRoot, 'src/tabs/indicator/prehydrationScript.min.ts'),
				},
				{
					find: '#prehydration/slider/thumb',
					replacement: resolve(reactRoot, 'src/slider/thumb/prehydrationScript.min.ts'),
				},
				{ find: /^react(?=\/|$)/, replacement: dirname(require.resolve('react/package.json')) },
				{
					find: /^react-dom(?=\/|$)/,
					replacement: dirname(require.resolve('react-dom/package.json')),
				},
			],
		},
		oxc: {
			tsconfig: false,
			jsx: { runtime: 'automatic', importSource: 'react' },
			target: 'es2020',
		},
	};
}
