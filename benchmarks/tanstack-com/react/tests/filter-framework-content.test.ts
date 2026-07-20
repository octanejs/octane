import { extractFrameworksFromMarkdown } from '../src/utils/markdown/filterFrameworkContent';

function assertEqual(actual: unknown, expected: unknown, message: string) {
	const actualJson = JSON.stringify(actual);
	const expectedJson = JSON.stringify(expected);
	if (actualJson !== expectedJson) {
		throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
	}
}

const frameworkBlockMarkdown = `
Shared content.

<!-- ::start:framework -->

# React

React content.

# Solid

Solid content.

# Vue

Vue content.

<!-- ::end:framework -->
`;

assertEqual(
	extractFrameworksFromMarkdown(frameworkBlockMarkdown),
	['react', 'solid', 'vue'],
	'framework block frameworks extracted',
);

const packageManagerMarkdown = `
<!-- ::start:tabs variant="package-manager" mode="install" -->
react: @tanstack/react-query
solid: @tanstack/solid-query
react: @tanstack/react-query-devtools
<!-- ::end:tabs -->
`;

assertEqual(
	extractFrameworksFromMarkdown(packageManagerMarkdown),
	['react', 'solid'],
	'package manager frameworks extracted and deduped',
);

const mixedMarkdown = `
<!-- ::start:framework -->
# Svelte
Svelte content.
# React
React content.
<!-- ::end:framework -->

<!-- ::start:tabs variant="package-managers" mode="install" -->
vue: @tanstack/vue-form
svelte: @tanstack/svelte-form
<!-- ::end:tabs -->
`;

assertEqual(
	extractFrameworksFromMarkdown(mixedMarkdown),
	['svelte', 'react', 'vue'],
	'mixed framework sources preserve first-seen order',
);

console.log('filter-framework-content tests passed');
