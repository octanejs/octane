import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	packageRewrite,
	differentialSetup,
} from '../../../../test-utils/differential-precompile.js';

const cacheDir = new URL('./.react-cache/', import.meta.url);

const { setup: compileFixtures, teardown } = differentialSetup({
	fixtureDir: new URL('../_fixtures/', import.meta.url),
	cacheDir,
	rewrites: [packageRewrite('@octanejs/lucide', 'lucide-react')],
	fixtures: 'all',
	depsFrom: import.meta.url,
});

export async function setup(): Promise<void> {
	await compileFixtures();
	// icons.tsrx uses a narrow Octane implementation facade so the unbundled
	// test does not load every generated icon. Give the compiled React fixture
	// the equivalent facade; the root export inventories are tested separately.
	writeFileSync(
		join(fileURLToPath(cacheDir), 'icons-runtime.js'),
		"export { Camera, CircleAlert, Icon, LucideProvider, Search } from 'lucide-react';\n",
	);
}

export { teardown };
