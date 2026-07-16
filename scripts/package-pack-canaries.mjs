import path from 'node:path';

function collectLocalProtocols(value, label, output) {
	if (typeof value === 'string') {
		if (/^(?:workspace|catalog|link):/.test(value)) output.push({ label, value });
		return;
	}
	if (Array.isArray(value)) {
		for (let index = 0; index < value.length; index++) {
			collectLocalProtocols(value[index], `${label}[${index}]`, output);
		}
		return;
	}
	if (value && typeof value === 'object') {
		for (const [key, child] of Object.entries(value)) {
			collectLocalProtocols(child, `${label}.${key}`, output);
		}
	}
}

export function isWithinDirectory(directory, target) {
	const relative = path.relative(directory, target);
	return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..');
}

export function createPackedExampleManifest(manifest, archiveSpecs, viteVersion, label) {
	const dependencies = { ...manifest.dependencies, ...archiveSpecs };
	const { pnpm: _packageManagerSettings, ...manifestWithoutPnpmSettings } = manifest;
	const packedManifest = {
		...manifestWithoutPnpmSettings,
		dependencies,
		devDependencies: { vite: viteVersion },
	};
	const unresolved = [];
	collectLocalProtocols(packedManifest, 'package.json', unresolved);
	if (unresolved.length) {
		throw new Error(
			`${label} retains local-only dependency protocols:\n${unresolved
				.map((entry) => `  ${entry.label}: ${entry.value}`)
				.join('\n')}`,
		);
	}
	return packedManifest;
}

export function renderPackedExampleWorkspace(archiveSpecs) {
	const overrides = Object.entries(archiveSpecs)
		.map(([packageName, spec]) => `  ${JSON.stringify(packageName)}: ${JSON.stringify(spec)}`)
		.join('\n');
	return `overrides:\n${overrides}\n`;
}
