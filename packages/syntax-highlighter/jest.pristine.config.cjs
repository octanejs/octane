const path = require('node:path');

const packageRoot = __dirname;
const upstreamRoot = path.join(packageRoot, 'upstream');
const dependency = (name) => path.join(packageRoot, 'node_modules', name);

module.exports = {
	rootDir: upstreamRoot,
	testEnvironment: 'jsdom',
	testMatch: ['<rootDir>/__tests__/*.js'],
	transform: {
		'^.+\\.[jt]sx?$': [
			dependency('babel-jest'),
			{ configFile: path.join(upstreamRoot, 'babel.config.js') },
		],
	},
	moduleNameMapper: {
		'^react$': dependency('react-upstream'),
		'^react/(.+)$': dependency('react-upstream/$1'),
		'^react-dom$': dependency('react-dom-upstream'),
		'^react-test-renderer$': dependency('react-test-renderer-upstream'),
		'^refractor/core$': dependency('refractor/lib/core.js'),
		'^refractor/all$': dependency('refractor/lib/all.js'),
		'^refractor/(.+)$': dependency('refractor/lang/$1.js'),
	},
	transformIgnorePatterns: [
		'node_modules/(?!refractor|hastscript|parse-entities|property-information|hast-util-parse-selector|comma-separated-tokens|space-separated-tokens|character-entities-legacy|character-reference-invalid|is-decimal|is-whitespace-like|is-blank)/',
	],
	collectCoverage: false,
};
