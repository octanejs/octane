// Minor and patch are optional so that partial ranges (`>=22`, `^8.0`) parse.
const VERSION = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?/;
const COMPARATOR = /^(\^|~|>=|<=|>|<|=)?\s*(.+)$/;

/**
 * @typedef {{ parts: [number, number, number], prerelease: string | null }} Version
 */

/**
 * @param {string} input
 * @returns {Version | null}
 */
export function parseVersion(input) {
	const match = VERSION.exec(String(input).trim());
	if (!match) return null;
	return {
		parts: [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)],
		prerelease: match[4] ?? null,
	};
}

/**
 * @param {Version} a
 * @param {Version} b
 * @returns {-1 | 0 | 1}
 */
export function compareVersions(a, b) {
	for (let i = 0; i < 3; i++) {
		if (a.parts[i] !== b.parts[i]) return a.parts[i] < b.parts[i] ? -1 : 1;
	}
	if (a.prerelease === b.prerelease) return 0;
	if (a.prerelease === null) return 1;
	if (b.prerelease === null) return -1;
	return a.prerelease < b.prerelease ? -1 : 1;
}

/**
 * @param {Version} version
 * @param {string} operator
 * @param {Version} target
 * @returns {boolean}
 */
function test(version, operator, target) {
	const order = compareVersions(version, target);
	switch (operator) {
		case '>=':
			return order >= 0;
		case '>':
			return order > 0;
		case '<=':
			return order <= 0;
		case '<':
			return order < 0;
		case '^': {
			if (order < 0) return false;
			const [major, minor] = target.parts;
			if (major > 0) return version.parts[0] === major;
			if (minor > 0) return version.parts[0] === 0 && version.parts[1] === minor;
			return (
				version.parts[0] === 0 && version.parts[1] === 0 && version.parts[2] === target.parts[2]
			);
		}
		case '~':
			return (
				order >= 0 && version.parts[0] === target.parts[0] && version.parts[1] === target.parts[1]
			);
		default:
			return order === 0;
	}
}

/**
 * Evaluate a version against a range.
 *
 * Deliberately narrow: it understands the comparator forms that Octane and its
 * bindings actually publish, and returns `null` for anything else (`workspace:*`,
 * git URLs, tags) so callers can say "not verified" instead of inventing a
 * verdict.
 *
 * @param {string} version
 * @param {string} range
 * @returns {boolean | null}
 */
export function satisfies(version, range) {
	const current = parseVersion(version);
	if (!current) return null;

	const trimmed = String(range).trim();
	if (trimmed === '' || trimmed === '*' || trimmed === 'x' || trimmed === 'latest') return true;

	for (const union of trimmed.split('||')) {
		let matched = true;
		let evaluated = false;

		for (const token of union.trim().split(/\s+/)) {
			if (token === '') continue;
			const parsed = COMPARATOR.exec(token);
			const target = parsed && parseVersion(parsed[2]);
			if (!target) return null;
			evaluated = true;
			if (!test(current, parsed[1] ?? '=', target)) {
				matched = false;
				break;
			}
		}

		if (evaluated && matched) return true;
	}

	return false;
}
