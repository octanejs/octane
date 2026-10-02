import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const LIFECYCLE_SCRIPTS = ['prepublishOnly', 'prepack', 'prepare', 'postpack', 'publish', 'postpublish'];
const PUBLISH_CONFIG_FIELDS = new Set([
	'bin',
	'engines',
	'type',
	'imports',
	'main',
	'module',
	'typings',
	'types',
	'exports',
	'browser',
	'esnext',
	'es2015',
	'unpkg',
	'umd:main',
	'os',
	'cpu',
	'libc',
	'typesVersions',
]);
const LICENSE_FILE = /LICEN[CS]E(?:\..+)?/i;
const ROOT_LICENSE_FILE = /^LICEN[CS]E(?:\..*)?$/;

// Matches pnpm's exportable manifest so tarballs keep the shape npm consumers already install.
export function createPublishManifest(manifest) {
	const { scripts, packageManager: _packageManager, pnpm: _pnpm, ...published } = manifest;
	if (scripts) {
		published.scripts = Object.fromEntries(
			Object.entries(scripts).filter(([name]) => !LIFECYCLE_SCRIPTS.includes(name)),
		);
	}
	if (published.publishConfig) {
		const publishConfig = { ...published.publishConfig };
		for (const key of Object.keys(publishConfig)) {
			if (!PUBLISH_CONFIG_FIELDS.has(key)) continue;
			published[key] = publishConfig[key];
			delete publishConfig[key];
		}
		if (Object.keys(publishConfig).length) published.publishConfig = publishConfig;
		else delete published.publishConfig;
	}
	return published;
}

function tar(args, cwd) {
	return execFileSync('tar', args, {
		cwd,
		encoding: 'utf8',
		env: { ...process.env, COPYFILE_DISABLE: '1' },
		stdio: ['ignore', 'pipe', 'pipe'],
	});
}

export function packPackage(directory, destination, { root = REPO_ROOT } = {}) {
	const staging = mkdtempSync(path.join(os.tmpdir(), 'octane-pack-'));
	try {
		const packed = path.join(staging, 'packed');
		execFileSync('bun', ['pm', 'pack', '--destination', packed, '--quiet'], {
			cwd: directory,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		const [archiveName, ...extra] = readdirSync(packed).filter((file) => file.endsWith('.tgz'));
		if (!archiveName || extra.length) throw new Error(`bun pm pack did not produce one tarball in ${directory}`);
		const unpacked = path.join(staging, 'unpacked');
		mkdirSync(unpacked);
		tar(['-xzf', path.join(packed, archiveName)], unpacked);
		const packageDirectory = path.join(unpacked, 'package');
		const manifestPath = path.join(packageDirectory, 'package.json');
		const manifest = createPublishManifest(JSON.parse(readFileSync(manifestPath, 'utf8')));
		writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
		if (path.resolve(directory) !== path.resolve(root) && !readdirSync(packageDirectory, { recursive: true }).some((file) => LICENSE_FILE.test(file))) {
			for (const file of readdirSync(root)) {
				if (ROOT_LICENSE_FILE.test(file)) copyFileSync(path.join(root, file), path.join(packageDirectory, file));
			}
		}
		mkdirSync(destination, { recursive: true });
		const archive = path.join(destination, archiveName);
		tar(['-czf', archive, 'package'], unpacked);
		return { archive, manifest };
	} finally {
		rmSync(staging, { force: true, recursive: true });
	}
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	const [directory, destination] = process.argv.slice(2);
	if (!directory || !destination) {
		console.error('usage: node scripts/pack-package.mjs <package-directory> <destination>');
		process.exit(1);
	}
	console.log(packPackage(path.resolve(directory), path.resolve(destination)).archive);
}
