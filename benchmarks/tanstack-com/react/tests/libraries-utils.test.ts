import assert from 'node:assert/strict';
import { orderFrameworksForBrowse } from '../src/routes/-libraries-utils';
import type { Framework } from '../src/libraries/types';

const frameworks: Array<{ value: Framework }> = [
	{ value: 'react' },
	{ value: 'vue' },
	{ value: 'solid' },
	{ value: 'vanilla' },
	{ value: 'ember' },
];

const ordered = orderFrameworksForBrowse(frameworks, {
	react: 8,
	vue: 5,
	solid: 5,
	vanilla: 10,
	ember: 1,
});

assert.deepEqual(
	ordered.map((framework) => framework.value),
	['react', 'vue', 'solid', 'ember', 'vanilla'],
	'frameworks sort by library count, preserve ties, and keep Vanilla last',
);

assert.deepEqual(
	frameworks.map((framework) => framework.value),
	['react', 'vue', 'solid', 'vanilla', 'ember'],
	'framework sorting does not mutate the shared framework options',
);

console.log('libraries utils tests passed');
