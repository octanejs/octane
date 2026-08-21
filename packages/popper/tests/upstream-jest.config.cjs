const path = require('node:path');
const { createRequire } = require('node:module');

const packageRequire = createRequire(path.resolve(__dirname, '../package.json'));
const upstreamRoot = path.resolve(__dirname, '../upstream');

// The snapshot resolver reads lock-regenerated copies under tests/upstream/tag/
// (gitignored). Materialize them here when absent so a clean checkout or a
// standalone lane run works offline; staleness is enforced by the parity
// verifiers.
const { execFileSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const regeneratedSnapshots = path.resolve(__dirname, 'upstream/tag/snapshots');
if (!existsSync(regeneratedSnapshots)) {
	execFileSync(
		process.execPath,
		[
			path.resolve(__dirname, '../../../scripts/react-port/materialize.mjs'),
			'run',
			'--package-dir',
			path.resolve(__dirname, '..'),
		],
		{ stdio: 'pipe' },
	);
}

function resolveFromPackage(specifier) {
	return packageRequire.resolve(specifier);
}

module.exports = {
	rootDir: upstreamRoot,
	testEnvironment: 'jsdom',
	setupFilesAfterEnv: [path.resolve(__dirname, 'upstream-jest.setup.cjs')],
	testMatch: ['<rootDir>/src/**/*.test.js'],
	transform: {
		'^.+\\.(js|jsx)$': resolveFromPackage('babel-jest'),
	},
	transformIgnorePatterns: ['/node_modules/(?!(@popperjs)/)'],
	moduleFileExtensions: ['js', 'jsx', 'json'],
	// Preserve Jest 25 pretty-format output expected by the pinned snapshots.
	snapshotFormat: {
		escapeString: true,
		printBasicPrototype: true,
	},
	// The pinned snapshots keep their byte-exact legacy header in upstream/;
	// Jest reads the lock-regenerated, header-corrected copies instead.
	snapshotResolver: path.resolve(__dirname, 'upstream-jest.snapshot-resolver.cjs'),
	moduleNameMapper: {
		'^react$': resolveFromPackage('react-18'),
		'^react/jsx-runtime$': resolveFromPackage('react-18/jsx-runtime'),
		'^react/jsx-dev-runtime$': resolveFromPackage('react-18/jsx-dev-runtime'),
		'^react-dom$': resolveFromPackage('react-dom-18'),
		'^react-dom/client$': resolveFromPackage('react-dom-18/client'),
		'^react-dom/test-utils$': resolveFromPackage('react-dom-18/test-utils'),
		'^react-test-renderer$': resolveFromPackage('react-test-renderer-18'),
		'^@popperjs/core$': resolveFromPackage('@popperjs/core-pristine'),
	},
};
