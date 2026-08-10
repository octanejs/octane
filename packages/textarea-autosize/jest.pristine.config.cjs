module.exports = {
	rootDir: __dirname,
	watchman: false,
	testEnvironment: 'jsdom',
	testMatch: ['<rootDir>/upstream/src/__tests__/index.test.js'],
	snapshotResolver: '<rootDir>/tests/pristine/snapshot-resolver.cjs',
	moduleNameMapper: {
		'^#is-browser$': '<rootDir>/upstream/src/conditions/true.ts',
		'^#is-development$': '<rootDir>/upstream/src/conditions/true.ts',
		'^@testing-library/jest-dom/extend-expect$':
			'<rootDir>/node_modules/@testing-library/jest-dom/dist/index.js',
		'^react$': '<rootDir>/node_modules/react',
		'^react-dom/(.*)$': '<rootDir>/node_modules/react-dom/$1',
	},
	transform: {
		'^.+\\.[jt]sx?$': [
			'babel-jest',
			{
				presets: [
					['@babel/preset-env', { targets: { node: 'current' } }],
					['@babel/preset-react', { runtime: 'automatic' }],
					'@babel/preset-typescript',
				],
			},
		],
	},
};
