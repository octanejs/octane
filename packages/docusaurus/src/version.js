import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

export const SUPPORTED_DOCUSARUS_VERSION = '3.10.1';
export const MINIMUM_DOCUSARUS_NODE_VERSION = '20.0.0';

const packageRequire = createRequire(import.meta.url);

function versionParts(version) {
	return version.split('.', 3).map((part) => Number.parseInt(part, 10) || 0);
}

function versionAtLeast(version, minimum) {
	const received = versionParts(version);
	const required = versionParts(minimum);
	for (let index = 0; index < 3; index++) {
		if (received[index] > required[index]) return true;
		if (received[index] < required[index]) return false;
	}
	return true;
}

function siteRequire(siteDir) {
	return createRequire(path.join(path.resolve(siteDir), 'package.json'));
}

export async function resolveDocusaurusCore(siteDir) {
	let manifestPath;
	try {
		manifestPath = siteRequire(siteDir).resolve('@docusaurus/core/package.json');
	} catch (siteError) {
		try {
			manifestPath = packageRequire.resolve('@docusaurus/core/package.json');
		} catch {
			throw new Error(
				`[@octanejs/docusaurus] Could not resolve @docusaurus/core from ${path.resolve(siteDir)}. ` +
					`Install @docusaurus/core@${SUPPORTED_DOCUSARUS_VERSION} in the site.`,
				{ cause: siteError },
			);
		}
	}
	const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
	return {
		manifestPath,
		packageRoot: path.dirname(manifestPath),
		version: String(manifest.version ?? ''),
	};
}

export function assertSupportedDocusaurusRuntime(resolved, options = {}) {
	if (!versionAtLeast(process.versions.node, MINIMUM_DOCUSARUS_NODE_VERSION)) {
		throw new Error(
			`[@octanejs/docusaurus] Docusaurus ${SUPPORTED_DOCUSARUS_VERSION} requires Node ` +
				`${MINIMUM_DOCUSARUS_NODE_VERSION} or newer; received ${process.versions.node}.`,
		);
	}
	if (
		resolved.version !== SUPPORTED_DOCUSARUS_VERSION &&
		options.allowUnsupportedVersion !== true
	) {
		throw new Error(
			`[@octanejs/docusaurus] This integration is pinned to @docusaurus/core@` +
				`${SUPPORTED_DOCUSARUS_VERSION}; resolved ${resolved.version || 'an unknown version'}. ` +
				`Pass allowUnsupportedVersion: true only for an explicit compatibility experiment.`,
		);
	}
}
