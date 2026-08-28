const { createRequire } = require('node:module');
const path = require('node:path');

require('../upstream/jest.setup.js');

const packageRequire = createRequire(path.resolve(__dirname, '../package.json'));
const prettyFormat = packageRequire('pretty-format');

// Jest 30 dropped the legacy toBeCalled / toBeCalledTimes aliases that the
// pinned react-popper 2.3.0 suite still uses.
expect.extend({
	toBeCalled(received) {
		const pass =
			typeof received === 'function' && received.mock != null && received.mock.calls.length > 0;
		return {
			pass,
			message() {
				return pass ? 'expected mock not to be called' : 'expected mock to be called';
			},
		};
	},
	toBeCalledTimes(received, expected) {
		const actual = received?.mock?.calls?.length ?? -1;
		const pass = actual === expected;
		return {
			pass,
			message() {
				return `expected mock to be called ${expected} times, was called ${actual} times`;
			},
		};
	},
});

// Newer jsdom/React serialize absolute positioning with explicit right/bottom
// auto properties that the pinned snapshots omit. Normalize only those defaults.
function normalizeStyleAttribute(value) {
	if (typeof value !== 'string') return value;
	return value
		.replace(/;\s*right:\s*auto/g, '')
		.replace(/;\s*bottom:\s*auto/g, '')
		.replace(/\s+right:\s*auto;\s*/g, ' ')
		.replace(/\s+bottom:\s*auto;\s*/g, ' ');
}

expect.addSnapshotSerializer({
	test(value) {
		return (
			value != null && typeof value === 'object' && (value.nodeType === 1 || value.nodeType === 11)
		);
	},
	serialize(value, config, indentation, depth, refs, printer) {
		const printed = prettyFormat.plugins.DOMElement.serialize(
			value,
			config,
			indentation,
			depth,
			refs,
			printer,
		);
		return normalizeStyleAttribute(printed);
	},
});
