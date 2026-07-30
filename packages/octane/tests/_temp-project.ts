/**
 * Throwaway project directories for tests that need real files on disk.
 *
 * Build, config-loader, and adapter suites feed real tools (Vite, Rsbuild,
 * esbuild, workerd) real directories, so they cannot use a mocked filesystem.
 * Those directories must not be the repository: an interrupted run leaves
 * debris behind, a watcher picks the writes up as source changes, and two
 * concurrent runs build into the same place.
 *
 * This lives beside `_helpers.ts` rather than inside it — `_helpers.ts` calls
 * `delegateEvents()` at import time, so it cannot be loaded from the
 * `@vitest-environment node` build suites that need this helper most.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface TempProject {
	/** The created directory. Always a real path, never a symlink. */
	root: string;
	/** Remove the directory. Safe to call more than once. */
	dispose(): void;
}

export interface TempProjectOptions {
	/**
	 * Stage under the process working directory instead of `os.tmpdir()`.
	 *
	 * Only workerd needs this: it resolves module paths against the process
	 * working directory and refuses to climb out of it, so a `/var/folders`
	 * (macOS) or `/tmp` (Linux/CI) root fails startup with `can't use ".." to
	 * break out of starting directory`. The directory still gets a per-run
	 * `mkdtemp` name under the gitignored `.test-scratch/`, so concurrent runs
	 * stay isolated and nothing tracked is left behind.
	 */
	insideWorkspace?: boolean;
}

/**
 * Create a throwaway project directory named `<prefix>-<random>`.
 *
 * `realpath` is load-bearing on macOS, where `os.tmpdir()` is a symlink into
 * `/private`: tools report resolved paths in module graphs, dependency lists,
 * and emitted configs, so a test comparing against the unresolved path fails.
 */
export function createTempProject(
	prefix: string,
	{ insideWorkspace = false }: TempProjectOptions = {},
): TempProject {
	const parent = insideWorkspace ? join(process.cwd(), '.test-scratch') : tmpdir();
	mkdirSync(parent, { recursive: true });
	const root = realpathSync(mkdtempSync(join(parent, `${prefix}-`)));
	return {
		root,
		dispose() {
			rmSync(root, { recursive: true, force: true });
			// Leave nothing at all behind once the last suite releases its
			// directory; a sibling still holding one keeps it (ENOTEMPTY).
			if (insideWorkspace) {
				try {
					rmdirSync(parent);
				} catch {}
			}
		},
	};
}
