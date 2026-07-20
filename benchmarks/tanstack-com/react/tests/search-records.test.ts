import assert from 'node:assert/strict';
import {
	hasFrameworkPath,
	shouldPersistFrameworkForHit,
	type SearchHitFrameworkContext,
} from '../src/utils/searchRecords';

type ShouldPersistCase = {
	name: string;
	hit: SearchHitFrameworkContext;
	expected: boolean;
};

const shouldPersistCases: Array<ShouldPersistCase> = [
	{
		name: 'canonical framework hit persists framework before navigation',
		hit: {
			url: 'https://tanstack.com/form/latest/docs/overview#validation',
			framework: 'solid',
			routeStyle: 'canonical',
		},
		expected: true,
	},
	{
		name: 'all-framework hit does not mutate preference',
		hit: {
			url: 'https://tanstack.com/form/latest/docs/overview#validation',
			framework: 'all',
			routeStyle: 'canonical',
		},
		expected: false,
	},
	{
		name: 'framework path hit already carries framework in URL',
		hit: {
			url: 'https://tanstack.com/query/latest/docs/framework/solid/overview#validation',
			framework: 'solid',
		},
		expected: false,
	},
	{
		name: 'framework-path route style does not persist framework',
		hit: {
			url: 'https://tanstack.com/query/latest/docs/overview#validation',
			framework: 'solid',
			routeStyle: 'framework-path',
		},
		expected: false,
	},
];

for (const testCase of shouldPersistCases) {
	assert.equal(shouldPersistFrameworkForHit(testCase.hit), testCase.expected, testCase.name);
}

assert.equal(
	hasFrameworkPath('/query/latest/docs/framework/solid/overview#validation'),
	true,
	'relative framework path is detected',
);

assert.equal(
	hasFrameworkPath('/form/latest/docs/overview#validation'),
	false,
	'canonical docs path is not treated as a framework path',
);

console.log('search-records tests passed');
