import { BaseSequencer } from 'vitest/node';

/**
 * Drops a project's Vite transform cache once its last test file of the run
 * has finished.
 *
 * Every project owns a Vite server whose module graph keeps each transformed
 * module's code, source map, and Vitest's inlined copy of that map until the
 * process exits. A sharded run loads dozens of projects that each transform
 * the Octane runtime from source, so the main process held all of them at
 * once and reached Node's default 4 GB heap. Invalidating a finished
 * project's graph frees those results; a later request transforms again.
 *
 * The sequencer counts the files to run, because it sorts them after
 * `--shard` selects them and reporters only see the unsharded list. The
 * reporter counts them down.
 */
export function releaseFinishedProjectGraphs() {
	/** @type {Map<object, number>} test files left per Vite server */
	const remaining = new Map();

	class ReleasingSequencer extends BaseSequencer {
		async sort(specifications) {
			const sorted = await super.sort(specifications);
			remaining.clear();
			// Watch mode reruns files against the same graph, so keep it warm there.
			if (this.ctx.config.watch) return sorted;
			for (const { project } of sorted) {
				remaining.set(project.vite, (remaining.get(project.vite) ?? 0) + 1);
			}
			return sorted;
		}
	}

	const reporter = {
		onTestModuleEnd(testModule) {
			const server = testModule.project.vite;
			const left = remaining.get(server);
			if (left === undefined) return;
			if (left > 1) {
				remaining.set(server, left - 1);
				return;
			}
			remaining.delete(server);
			for (const environment of Object.values(server.environments)) {
				environment.moduleGraph.invalidateAll();
			}
		},
	};

	return { sequencer: ReleasingSequencer, reporter };
}
