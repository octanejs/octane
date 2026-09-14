import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	compileReactFixture,
	packageRewrite,
} from '../../../../test-utils/differential-precompile.js';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '../..');
const repoRoot = resolve(packageRoot, '../..');
const cacheDir = join(here, '.react-cache');
const manifest = JSON.parse(readFileSync(join(packageRoot, 'audit/react-parity.json'), 'utf8')) as {
	lanes: Array<{
		id: string;
		files: Array<{ path: string }>;
	}>;
};

function differentialFixtures(): string[] {
	const lane = manifest.lanes.find(function find(entry) {
		return entry.id === 'tanstack-pacer-differential';
	});
	if (!lane) throw new Error('missing tanstack-pacer-differential lane in react-parity.json');
	return lane.files
		.map(function toPath(entry) {
			return entry.path;
		})
		.filter(function keepTsrx(path) {
			return path.endsWith('.tsrx');
		})
		.map(function absolute(path) {
			return resolve(repoRoot, path);
		});
}

export async function setup(): Promise<void> {
	rmSync(cacheDir, { recursive: true, force: true });
	mkdirSync(cacheDir, { recursive: true });
	for (const fixture of differentialFixtures()) {
		compileReactFixture(fixture, {
			fixtureDir: dirname(fixture),
			cacheDir,
			rewrites: [packageRewrite('@octanejs/tanstack-pacer', '@tanstack/react-pacer')],
			fixtures: 'all',
			depsFrom: import.meta.url,
		});
	}
}

export async function teardown(): Promise<void> {}
