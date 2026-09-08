const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const testPath = path.join(root, 'upstream/src/__tests__/index.test.js');
const snapshotPath = path.join(__dirname, '__snapshots__/index.test.js.snap');

module.exports = {
	resolveSnapshotPath() {
		return snapshotPath;
	},
	resolveTestPath() {
		return testPath;
	},
	testPathForConsistencyCheck: testPath,
};
