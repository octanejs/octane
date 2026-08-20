const PACKAGE_NAME_PATTERN =
	/^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/;
const GITHUB_PART_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;

function assertPackageName(packageName) {
	if (!PACKAGE_NAME_PATTERN.test(packageName)) {
		throw new Error(`Invalid package input: ${packageName}`);
	}
}

function parsePackageSpecifier(input) {
	let packageName;
	let selector = null;

	if (input.startsWith('@')) {
		const slash = input.indexOf('/');
		const selectorSeparator = slash === -1 ? -1 : input.indexOf('@', slash);
		packageName = selectorSeparator === -1 ? input : input.slice(0, selectorSeparator);
		selector = selectorSeparator === -1 ? null : input.slice(selectorSeparator + 1);
	} else {
		const selectorSeparator = input.lastIndexOf('@');
		packageName = selectorSeparator <= 0 ? input : input.slice(0, selectorSeparator);
		selector = selectorSeparator <= 0 ? null : input.slice(selectorSeparator + 1);
	}

	assertPackageName(packageName);
	if (selector !== null && (!selector || /[\u0000-\u001f\u007f\\/]/.test(selector))) {
		throw new Error(`Invalid package input selector: ${input}`);
	}

	return { kind: 'npm', packageName, selector };
}

export function decodePathPart(part, label) {
	let decoded;
	try {
		decoded = decodeURIComponent(part);
	} catch {
		throw new Error(`Invalid ${label} encoding`);
	}
	if (
		!decoded ||
		decoded === '.' ||
		decoded === '..' ||
		decoded.includes('/') ||
		decoded.includes('\\')
	) {
		throw new Error(`Invalid ${label}`);
	}
	return decoded;
}

function parseNpmUrl(url) {
	const parts = url.pathname.split('/').filter(Boolean);
	if (parts[0] !== 'package') {
		throw new Error('Only supported npm package URLs may be used');
	}

	let packageName;
	let cursor;
	if (parts[1]?.startsWith('@')) {
		if (!parts[2]) throw new Error('Invalid npm package URL');
		packageName = `${decodePathPart(parts[1], 'npm scope')}/${decodePathPart(parts[2], 'npm package')}`;
		cursor = 3;
	} else {
		packageName = decodePathPart(parts[1] ?? '', 'npm package');
		cursor = 2;
	}
	assertPackageName(packageName);

	let selector = null;
	if (parts.length > cursor) {
		if (parts[cursor] !== 'v' || parts.length !== cursor + 2) {
			throw new Error('Only supported npm package version URLs may be used');
		}
		selector = decodePathPart(parts[cursor + 1], 'npm version');
	}

	return { kind: 'npm', packageName, selector };
}

export function parseGitHubUrl(url) {
	const parts = url.pathname.split('/').filter(Boolean);
	if (parts.length < 2) throw new Error('Invalid GitHub repository URL');

	const owner = decodePathPart(parts[0], 'GitHub owner');
	const repo = decodePathPart(parts[1], 'GitHub repository').replace(/\.git$/, '');
	if (!GITHUB_PART_PATTERN.test(owner) || !GITHUB_PART_PATTERN.test(repo)) {
		throw new Error('Invalid GitHub repository URL');
	}

	let ref = null;
	let subdirectory = null;
	if (parts.length > 2) {
		if (parts[2] !== 'tree' || !parts[3]) {
			throw new Error('Only supported GitHub repository and tree URLs may be used');
		}
		ref = decodePathPart(parts[3], 'GitHub ref');
		const subdirectoryParts = parts.slice(4).map((part) => decodePathPart(part, 'GitHub path'));
		subdirectory = subdirectoryParts.length === 0 ? null : subdirectoryParts.join('/');
	}

	return { kind: 'github', owner, repo, ref, subdirectory };
}

export function parseInput(rawInput) {
	if (typeof rawInput !== 'string' || !rawInput.trim()) {
		throw new Error('A package input is required');
	}
	const input = rawInput.trim();

	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) {
		const url = new URL(input);
		if (url.protocol !== 'https:') throw new Error('Remote inputs must use HTTPS');
		if (url.username || url.password || url.search || url.hash) {
			throw new Error(
				'Remote input URLs must not contain credentials, query parameters, or fragments',
			);
		}
		if (url.hostname === 'www.npmjs.com' || url.hostname === 'npmjs.com') return parseNpmUrl(url);
		if (url.hostname === 'github.com') return parseGitHubUrl(url);
		throw new Error(`The host ${url.hostname} is not supported`);
	}

	return parsePackageSpecifier(input);
}
