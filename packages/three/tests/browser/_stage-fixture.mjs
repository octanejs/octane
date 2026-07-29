// Fixture staging for the production bundler suites.
//
// Vite, Rsbuild, and Rspack all write beside the project they build: bundles,
// config-load temp files, resolver caches, and the `node_modules` entries a
// fixture needs to resolve workspace packages by bare specifier. None of those
// paths are covered by .gitignore, so building in place leaves untracked
// `dist-*` and `node_modules` directories in the checkout whenever a run is
// interrupted before its cleanup hook. Building a copy of the fixture under the
// OS temp directory keeps the working tree clean either way, and lets the OS
// reclaim the output if the suite dies before it can.
import {
	copyFileSync,
	cpSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	realpathSync,
	rmSync,
	statSync,
	symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

// `junction` is the only directory link an unprivileged Windows process may
// create, and it requires an absolute target. Everywhere else, a plain 'dir'.
const LINK_TYPE = process.platform === 'win32' ? 'junction' : 'dir';

/**
 * A fresh, empty staging root. The realpath matters: macOS reaches its temp
 * directory through the /var -> /private/var alias, and Rolldown only accepts
 * an HTML input that sits under the exact normalized build root.
 */
export function createStagingRoot(name) {
	return realpathSync(mkdtempSync(join(tmpdir(), `octane-${name}-`)));
}

function mirror(root, name, source) {
	const destination = resolve(root, 'node_modules', ...name.split('/'));
	mkdirSync(dirname(destination), { recursive: true });
	// Unlinks a previously mirrored entry rather than its target: `rm` lstats,
	// so an explicit `link` may override a mirrored package safely.
	rmSync(destination, { recursive: true, force: true });
	if (statSync(source).isDirectory()) symlinkSync(source, destination, LINK_TYPE);
	else copyFileSync(source, destination);
}

/**
 * Copy the fixture app at `fixtureRoot` into `root` and link a resolvable
 * dependency graph beside it: every non-dot entry of
 * `dependencies/node_modules`, plus each workspace package in `link`, which
 * covers the host package's self-reference and anything the host does not
 * itself install.
 */
export function stageFixture(fixtureRoot, root, { dependencies, link = {} }) {
	// Copy the authored sources rather than symlinking them. Bundlers resolve
	// modules through their real path, so a symlinked `src` would put every
	// module id back under the checkout and change the root-relative ids the
	// client-reference manifest records.
	cpSync(fixtureRoot, root, {
		force: true,
		recursive: true,
		filter: (source) => {
			const name = basename(source);
			return name !== 'node_modules' && !name.startsWith('dist');
		},
	});

	const installed = resolve(dependencies, 'node_modules');
	for (const entry of readdirSync(installed, { withFileTypes: true })) {
		if (entry.name.startsWith('.')) continue;
		// Scope directories are recreated, not linked: linking `@octanejs` whole
		// would make an added `link` entry write into the checkout's node_modules.
		if (entry.name.startsWith('@')) {
			for (const scoped of readdirSync(resolve(installed, entry.name))) {
				mirror(root, `${entry.name}/${scoped}`, resolve(installed, entry.name, scoped));
			}
			continue;
		}
		mirror(root, entry.name, resolve(installed, entry.name));
	}
	for (const [name, target] of Object.entries(link)) mirror(root, name, target);

	return root;
}
