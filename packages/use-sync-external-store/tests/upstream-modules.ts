import { transformWithOxc, type Plugin } from 'vite';

/**
 * Runs the pinned Jest test files as Vitest modules without changing their
 * bytes on disk. They reach their modules through `require`, `jest`, `gate`
 * and `__DEV__`, which are bound here to a harness registry; their JSX
 * compiles to `React.createElement` as in React's Jest setup; and a
 * `// @gate flag` case runs only when that build-test flag is on.
 *
 * With `octane: true`, an `octane` import also hands the module to the Octane
 * compiler, which slots its hook calls.
 */
export function upstreamTestModules(options: {
	include: RegExp;
	harness: string;
	octane: boolean;
}): Plugin {
	return {
		name: 'use-sync-external-store-upstream-tests',
		enforce: 'pre',
		async transform(code, id) {
			if (!options.include.test(id)) return;
			const gated = code.replace(
				/(\/\/ @gate (\w+)\n\s*)it\(/g,
				'$1(gate((flags) => flags.$2) ? it : it.skip)(',
			);
			const compiled = await transformWithOxc(gated, id, {
				lang: 'jsx',
				jsx: { runtime: 'classic', pragma: 'React.createElement', pragmaFrag: 'React.Fragment' },
			});
			const imports =
				`import { __DEV__, gate, jest, require } from ${JSON.stringify(options.harness)};` +
				(options.octane ? "import * as OctaneRuntime from 'octane';" : '');
			return { code: imports + compiled.code, map: compiled.map };
		},
	};
}
