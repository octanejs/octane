const path = require('node:path');

// The committed upstream/ tree stays byte-exact against the lock, but Jest 30
// rejects the pinned snapshot's legacy goo.gl header. The lock's adapted
// rewrite regenerates a header-corrected copy under tests/upstream/tag/
// (gitignored); this resolver points Jest at it without touching the pristine
// tree.
const snapshotDirectory = path.resolve(__dirname, 'upstream/tag/snapshots');
const testDirectory = path.resolve(__dirname, '../upstream/tests');

module.exports = {
	resolveSnapshotPath(testPath, snapshotExtension) {
		return path.join(snapshotDirectory, path.basename(testPath) + snapshotExtension);
	},
	resolveTestPath(snapshotFilePath, snapshotExtension) {
		return path.join(testDirectory, path.basename(snapshotFilePath, snapshotExtension));
	},
	testPathForConsistencyCheck: path.join(testDirectory, 'components.test.js'),
};
