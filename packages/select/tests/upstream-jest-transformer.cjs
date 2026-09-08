const { createTransformer } = require('babel-jest');

module.exports = createTransformer({
	plugins: [
		require.resolve('@emotion/babel-plugin'),
		[require.resolve('@babel/plugin-proposal-class-properties'), { loose: true }],
		[require.resolve('@babel/plugin-proposal-private-methods'), { loose: true }],
		require.resolve('@babel/plugin-transform-runtime'),
	],
	presets: [
		require.resolve('@babel/preset-env'),
		require.resolve('@babel/preset-react'),
		require.resolve('@babel/preset-typescript'),
	],
});
