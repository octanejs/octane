module.exports = {
	ci: true,
	testEnvironment: 'jsdom',
	testMatch: ['<rootDir>/src/__tests__/*.test.tsx'],
	moduleNameMapper: {
		'^react$': '<rootDir>/../node_modules/react-select-pristine-react',
		'^react-dom$': '<rootDir>/../node_modules/react-select-pristine-react-dom',
		'^react-dom/(.*)$': '<rootDir>/../node_modules/react-select-pristine-react-dom/$1',
	},
	transform: { '^.+\\.tsx?$': '<rootDir>/../tests/upstream-jest-transformer.cjs' },
	setupFilesAfterEnv: ['<rootDir>/../tests/upstream-jest.setup.ts'],
	snapshotSerializers: ['<rootDir>/../tests/upstream-emotion-serializer.cjs'],
};
