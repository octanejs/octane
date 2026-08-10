const { createRequire } = require('node:module');
const { createTransformer } = require('babel-jest');

const requireFromPackage = createRequire(`${__dirname}/../package.json`);

const babelTransformer = createTransformer({
	babelrc: false,
	configFile: false,
	presets: [
		[
			requireFromPackage.resolve('@babel/preset-env'),
			{
				targets: { node: 'current' },
				modules: 'commonjs',
			},
		],
		[
			requireFromPackage.resolve('@babel/preset-react'),
			{
				runtime: 'classic',
			},
		],
	],
	// Upstream babel-preset-jason exposed default exports as module.exports;
	// several suites require() without `.default`.
	plugins: [requireFromPackage.resolve('babel-plugin-add-module-exports')],
});

module.exports = {
	process(sourceText, sourcePath, options) {
		const rewritten = sourceText.replace(/\bjest\.resetModuleRegistry\b/g, 'jest.resetModules');
		return babelTransformer.process(rewritten, sourcePath, options);
	},
	getCacheKey(sourceText, sourcePath, options) {
		const rewritten = sourceText.replace(/\bjest\.resetModuleRegistry\b/g, 'jest.resetModules');
		return babelTransformer.getCacheKey(rewritten, sourcePath, options);
	},
};
