import semver from 'semver';

function normalizedRange(range) {
	if (typeof range !== 'string') return null;
	const value = range.trim();
	if (!value || value.startsWith('workspace:')) return null;
	return value.toLowerCase() === 'latest' ? '*' : value;
}

export function compareVersions(leftValue, rightValue) {
	const left = Array.isArray(leftValue) ? leftValue.join('.') : leftValue;
	const right = Array.isArray(rightValue) ? rightValue.join('.') : rightValue;
	if (!semver.valid(left) || !semver.valid(right)) {
		throw new Error('Only valid semantic versions can be ordered');
	}
	return semver.compare(left, right);
}

export function satisfiesRange(version, range) {
	if (version === range) return true;
	const normalized = normalizedRange(range);
	if (!semver.valid(version) || !normalized) return false;
	try {
		return semver.satisfies(version, normalized);
	} catch {
		return false;
	}
}

export function rangesOverlap(leftRange, rightRange) {
	if (leftRange === rightRange) return true;
	const left = normalizedRange(leftRange);
	const right = normalizedRange(rightRange);
	if (!left || !right) return false;
	try {
		return semver.intersects(left, right);
	} catch {
		return false;
	}
}

export function selectHighestSatisfyingVersion(versions, range) {
	if (versions.includes(range)) return range;
	const candidates = versions.filter(
		(version) =>
			semver.valid(version) && !semver.prerelease(version) && satisfiesRange(version, range),
	);
	if (candidates.length === 0) return null;
	return candidates.sort(semver.rcompare)[0];
}
