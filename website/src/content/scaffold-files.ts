// What `octane create` writes, for the file trees on the CLI page.
//
// The paths are generated: `pnpm scaffold:manifest` runs the real command under
// `--dry-run` and snapshots the result, and CI fails when the snapshot is stale.
// Restating them here by hand is how a documented file tree quietly stops
// describing the product.
//
// The notes stay here because they are documentation rather than a fact about
// the CLI, and they do not change when a file is added.

import manifestJson from '../../../packages/cli/data/scaffold-manifest.json';
import type { FileTreeEntry } from '../components/FileTree.tsrx';

interface ScaffoldManifest {
	templates: Record<string, string[]>;
}

const manifest = manifestJson as ScaffoldManifest;

/**
 * The generated path list for one template, with the notes attached.
 *
 * A note for a path the template no longer writes throws rather than being
 * dropped: a rename that silently orphans its explanation leaves the page
 * looking correct while it has lost a sentence, which is the drift this
 * manifest exists to catch.
 */
export function scaffoldTemplate(
	mode: string,
	notes: Readonly<Record<string, string>> = {},
): readonly FileTreeEntry[] {
	const files = manifest.templates[mode];
	if (files === undefined) {
		throw new Error(`scaffold-manifest.json describes no "${mode}" template.`);
	}
	for (const described of Object.keys(notes)) {
		if (!files.includes(described)) {
			throw new Error(
				`The ${mode} template no longer writes ${described}, but a note describes it.`,
			);
		}
	}
	return files.map((path) => {
		const note = notes[path];
		return note === undefined ? { path } : { path, note };
	});
}

export const spaFiles = scaffoldTemplate('spa');

export const fullstackFiles = scaffoldTemplate('fullstack', {
	'index.html': 'SSR markers',
	'octane.config.ts': 'routes',
	'src/server/health.ts': 'GET /api/health',
});
