export const MAX_REPO_PATH_LENGTH = 512;

const REPO_PATH_SEGMENT_PATTERN = /^[a-zA-Z0-9._$+-]+$/;

export function isValidRepoPath(path: string) {
	if (path === '') {
		return true;
	}

	if (path.length > MAX_REPO_PATH_LENGTH) {
		return false;
	}

	if (path.startsWith('/') || path.endsWith('/') || path.includes('//') || path.includes('..')) {
		return false;
	}

	return path.split('/').every((segment) => {
		return REPO_PATH_SEGMENT_PATTERN.test(segment);
	});
}

export function joinRepoPath(basePath: string, childPath: string) {
	const normalizedBasePath = trimRepoPath(basePath);
	const normalizedChildPath = trimRepoPath(childPath);

	if (!normalizedBasePath) {
		return normalizedChildPath;
	}

	if (!normalizedChildPath) {
		return normalizedBasePath;
	}

	if (
		normalizedChildPath === normalizedBasePath ||
		normalizedChildPath.startsWith(`${normalizedBasePath}/`)
	) {
		return normalizedChildPath;
	}

	return `${normalizedBasePath}/${normalizedChildPath}`;
}

function trimRepoPath(path: string) {
	return path.replace(/^\/+|\/+$/g, '');
}
