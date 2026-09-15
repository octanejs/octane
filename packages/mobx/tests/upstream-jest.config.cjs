const path = require('node:path');

module.exports = {
	rootDir: path.resolve(__dirname, '../upstream'),
	testRegex: '__tests__/.*\\.tsx?$',
	testPathIgnorePatterns: ['node_modules', '/__tests__/utils/'],
	testEnvironment: require.resolve('jest-environment-jsdom'),
	globals: { __DEV__: true },
	setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
	moduleNameMapper: {
		'^react$': require.resolve('mobx-pristine-react'),
		'^react/jsx-runtime$': require.resolve('mobx-pristine-react/jsx-runtime'),
		'^react-dom$': require.resolve('mobx-pristine-react-dom'),
		'^react-dom/client$': require.resolve('mobx-pristine-react-dom/client'),
		'^react-dom/test-utils$': require.resolve('mobx-pristine-react-dom/test-utils'),
		'^@testing-library/jest-dom/extend-expect$': require.resolve('@testing-library/jest-dom'),
	},
	transform: {
		'^.+\\.[jt]sx?$': [
			require.resolve('ts-jest'),
			{
				diagnostics: false,
				tsconfig: path.join(__dirname, 'pristine.tsconfig.json'),
			},
		],
	},
};
