// Runs the pinned react-hot-toast@2.6.1 Jest suite byte-for-byte against the
// pinned React source in upstream/. Upstream transforms with ts-jest; Babel
// strips the same TypeScript here, so the suite and its setup run unchanged.
module.exports = {
	rootDir: __dirname,
	watchman: false,
	testEnvironment: 'jsdom',
	testMatch: ['<rootDir>/upstream/test/**/*.test.tsx'],
	setupFilesAfterEnv: ['<rootDir>/upstream/test/setup.ts'],
	moduleNameMapper: {
		'^react$': '<rootDir>/node_modules/react',
		'^react/(.*)$': '<rootDir>/node_modules/react/$1',
		'^react-dom$': '<rootDir>/node_modules/react-dom',
		'^react-dom/(.*)$': '<rootDir>/node_modules/react-dom/$1',
	},
	transform: {
		'^.+\\.[jt]sx?$': [
			'babel-jest',
			{
				presets: [
					[require.resolve('@babel/preset-env'), { targets: { node: 'current' } }],
					[require.resolve('@babel/preset-react'), { runtime: 'automatic' }],
					require.resolve('@babel/preset-typescript'),
				],
			},
		],
	},
};
