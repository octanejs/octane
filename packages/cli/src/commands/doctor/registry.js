import { bundlerChecks } from './checks/bundler.js';
import { configChecks } from './checks/config.js';
import { dependencyChecks } from './checks/dependencies.js';
import { environmentChecks } from './checks/environment.js';
import { sourceChecks } from './checks/source.js';
import { typescriptChecks } from './checks/typescript.js';

/**
 * Report order, cheapest and most fundamental first: a wrong Node version or a
 * duplicated runtime explains failures further down the list, so it is shown
 * before them.
 *
 * @type {import('./check.js').Check['category'][]}
 */
export const CATEGORIES = [
	'environment',
	'dependencies',
	'bundler',
	'typescript',
	'config',
	'source',
];

/** @type {import('./check.js').Check[]} */
export const CHECKS = [
	...environmentChecks,
	...dependencyChecks,
	...bundlerChecks,
	...typescriptChecks,
	...configChecks,
	...sourceChecks,
];
