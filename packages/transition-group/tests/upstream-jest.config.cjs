/** Jest config for the byte-exact react-transition-group v4.4.5 suite. */
const { createRequire } = require('node:module');
const { dirname, resolve } = require('node:path');

const requireFromPackage = createRequire(`${__dirname}/../package.json`);
const reactRoot = dirname(requireFromPackage.resolve('react18/package.json'));
const reactDomRoot = dirname(requireFromPackage.resolve('react-dom18/package.json'));

module.exports = {
	testRegex: '-test\\.js$',
	testEnvironment: 'jsdom',
	setupFiles: ['<rootDir>/test/setup.js'],
	setupFilesAfterEnv: [resolve(__dirname, 'upstream-jest.setup.cjs')],
	roots: ['<rootDir>/test'],
	// Upstream's suite and findDOMNode spies target React 18; the workspace React
	// oracle stays on 19 for Octane packages.
	moduleNameMapper: {
		'^react$': `${reactRoot}/index.js`,
		'^react/jsx-runtime$': `${reactRoot}/jsx-runtime.js`,
		'^react/jsx-dev-runtime$': `${reactRoot}/jsx-dev-runtime.js`,
		'^react-dom$': `${reactDomRoot}/index.js`,
		'^react-dom/client$': `${reactDomRoot}/client.js`,
		'^react-dom/test-utils$': `${reactDomRoot}/test-utils.js`,
		// Upstream utils re-export the full package; after jest.resetModules the
		// non-pure entry tries to register afterAll inside beforeEach. Pure has
		// the same render/act surface without suite-level hooks.
		'^@testing-library/react$': requireFromPackage.resolve('@testing-library/react/pure'),
	},
	transform: {
		'^.+\\.jsx?$': resolve(__dirname, 'upstream-jest-transform.cjs'),
	},
};
