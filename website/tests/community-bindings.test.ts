import { describe, expect, it } from 'vitest';
import {
	COMMUNITY_BINDING_GROUPS,
	validateCommunityBindingCatalog,
} from '../src/content/community-bindings.ts';

const EXPECTED_CATALOG = [
	{
		id: 'library-bindings',
		title: 'Library bindings',
		entries: [
			{
				id: 'tanstack-ai',
				name: 'TanStack AI',
				purpose: 'Octane hooks for building streaming AI experiences with TanStack AI.',
				owner: 'TanStack',
				destination: 'https://github.com/TanStack/ai/tree/main/packages/ai-octane',
				searchNames: ['@tanstack/ai-octane'],
			},
			{
				id: 'tanstack-table',
				name: 'TanStack Table',
				purpose: 'An Octane adapter for building headless tables with TanStack Table.',
				owner: 'TanStack',
				destination: 'https://github.com/TanStack/table/tree/main/packages/octane-table',
				searchNames: ['@tanstack/octane-table'],
			},
			{
				id: 'tanstack-store',
				name: 'TanStack Store',
				purpose: 'Octane bindings for reactive state managed with TanStack Store.',
				owner: 'TanStack',
				destination: 'https://github.com/TanStack/store/tree/main/packages/octane-store',
				searchNames: ['@tanstack/octane-store'],
			},
			{
				id: 'tanstack-charts',
				name: 'TanStack Charts',
				purpose: 'Octane chart components with canvas, core, client, and server entry points.',
				owner: 'TanStack',
				destination: 'https://github.com/TanStack/charts/tree/main/packages/octane',
				searchNames: ['@tanstack/charts/octane', '@tanstack/octane-charts'],
			},
			{
				id: 'tanstack-markdown',
				name: 'TanStack Markdown',
				purpose: 'An Octane renderer exported by TanStack Markdown.',
				owner: 'TanStack',
				destination: 'https://github.com/TanStack/markdown',
				searchNames: ['@tanstack/markdown/octane'],
			},
			{
				id: 'tanstack-highlight',
				name: 'TanStack Highlight',
				purpose: 'Octane code highlighting with direct component and MDX integration.',
				owner: 'TanStack',
				destination:
					'https://github.com/TanStack/highlight/blob/main/docs/guides/octane.md',
				searchNames: ['@tanstack/highlight/octane'],
			},
			{
				id: 'markstream',
				name: 'Markstream',
				purpose: 'Streaming Markdown rendering for Octane on the client and server.',
				owner: 'Simon-He95',
				destination:
					'https://github.com/Simon-He95/markstream-vue/tree/main/packages/markstream-octane',
				searchNames: ['markstream-octane'],
			},
			{
				id: 'lisse',
				name: 'Lisse',
				purpose: 'Squircle hooks and components for Octane applications.',
				owner: 'JaceThings',
				destination: 'https://github.com/JaceThings/Lisse/tree/main/packages/octane',
				searchNames: ['@lisse/octane', 'lisse-octane'],
			},
			{
				id: 'hot-toast',
				name: 'Hot Toast',
				purpose: 'Toast components and hooks designed for Octane applications.',
				owner: 'efossvold',
				destination: 'https://github.com/efossvold/octane-hot-toast',
				searchNames: ['octane-hot-toast'],
			},
			{
				id: 'octane-signal',
				name: 'Octane Signal',
				purpose: 'Octane hooks that connect alien-signals state to component rendering.',
				owner: 'hunghg255',
				destination: 'https://github.com/hunghg255/octane-signal',
				searchNames: ['octane-signal'],
			},
			{
				id: 'likftc',
				name: 'Likftc',
				purpose: 'An Octane hook for stable transition keys with Likftc.',
				owner: 'vp-tw',
				destination: 'https://github.com/vp-tw/likftc',
				searchNames: ['@vp-tw/likftc/octane'],
			},
			{
				id: 'segment-state',
				name: 'Segment State',
				purpose: 'Octane hooks for composing and consuming Segment state.',
				owner: 'WebEferen',
				destination: 'https://github.com/WebEferen/segment',
				searchNames: ['segment-state'],
			},
		],
	},
	{
		id: 'tooling-and-deployment',
		title: 'Tooling and deployment',
		entries: [
			{
				id: 'cypress-component-testing',
				name: 'Cypress component testing',
				purpose: 'A Cypress component-testing mount adapter for Octane components.',
				owner: 'efossvold',
				destination: 'https://github.com/efossvold/cypress-ct-octane-js',
				searchNames: ['cypress-ct-octane-js'],
			},
			{
				id: 'nativescript-community',
				name: 'NativeScript Community',
				purpose: 'Vite and HMR integration for running Octane with NativeScript.',
				owner: 'NativeScript Community',
				destination:
					'https://github.com/nativescript-community/octane/tree/main/packages/vite-octane',
				searchNames: ['@nativescript-community/vite-octane'],
			},
			{
				id: 'nextane',
				name: 'Nextane',
				purpose: 'A file-routed Octane metaframework with server rendering and data loading.',
				owner: 'southpolesteve',
				destination: 'https://github.com/southpolesteve/nextane',
				searchNames: ['nextane'],
			},
			{
				id: 'alchemy',
				name: 'Alchemy',
				purpose: 'Build and deployment integration for Octane on Cloudflare, AWS, and Node.',
				owner: 'Alchemy',
				destination:
					'https://github.com/alchemy-run/alchemy/tree/main/packages/frontend-frameworks/src/octane',
				searchNames: [
					'@alchemy.run/frontend-frameworks/octane',
					'@distilled.cloud/octane',
				],
			},
		],
	},
	{
		id: 'platforms-and-native-renderers',
		title: 'Platforms and native renderers',
		entries: [
			{
				id: 'pocketjs',
				name: 'PocketJS',
				purpose: 'A native application runtime with an Octane renderer and compiler target.',
				owner: 'Pocket Stack',
				destination: 'https://pocketjs.dev/docs/frameworks/',
				searchNames: ['@pocketjs/framework/octane'],
			},
		],
	},
] as const;

describe('community binding catalog', () => {
	it('publishes the confirmed catalog in reviewed group and project order', () => {
		expect(COMMUNITY_BINDING_GROUPS).toEqual(EXPECTED_CATALOG);
		expect(
			COMMUNITY_BINDING_GROUPS.flatMap((group) =>
				group.entries.flatMap((entry) => entry.searchNames),
			),
		).not.toEqual(expect.arrayContaining(['tanejs', 'flamefront']));

		for (const group of COMMUNITY_BINDING_GROUPS) {
			for (const entry of group.entries) {
				expect(Object.keys(entry).sort()).toEqual([
					'destination',
					'id',
					'name',
					'owner',
					'purpose',
					'searchNames',
				]);
			}
		}
	});

	it('rejects duplicate stable IDs and normalized search names', () => {
		const duplicateId = structuredClone(COMMUNITY_BINDING_GROUPS);
		duplicateId[0].entries[1].id = duplicateId[0].entries[0].id;
		expect(() => validateCommunityBindingCatalog(duplicateId)).toThrow(/duplicate entry id.*tanstack-ai/i);

		const duplicateSearchName = structuredClone(COMMUNITY_BINDING_GROUPS);
		duplicateSearchName[0].entries[1].searchNames[0] = '@TANSTACK/AI-OCTANE';
		expect(() => validateCommunityBindingCatalog(duplicateSearchName)).toThrow(
			/duplicate searchNames.*@tanstack\/ai-octane/i,
		);
	});

	it.each([
		['id', 'id'],
		['name', 'name'],
		['purpose', 'purpose'],
		['owner', 'owner'],
		['destination', 'destination'],
	] as const)('rejects an empty required %s field', (field, expectedDiagnostic) => {
		const catalog = structuredClone(COMMUNITY_BINDING_GROUPS);
		catalog[0].entries[0][field] = '';

		expect(() => validateCommunityBindingCatalog(catalog)).toThrow(expectedDiagnostic);
	});

	it('requires at least one non-empty searchable package or entry-point name', () => {
		const noSearchNames = structuredClone(COMMUNITY_BINDING_GROUPS);
		noSearchNames[0].entries[0].searchNames = [];
		expect(() => validateCommunityBindingCatalog(noSearchNames)).toThrow(/searchNames/i);

		const emptySearchName = structuredClone(COMMUNITY_BINDING_GROUPS);
		emptySearchName[0].entries[0].searchNames = ['  '];
		expect(() => validateCommunityBindingCatalog(emptySearchName)).toThrow(/searchNames\[0\]/i);
	});

	it.each(['http://example.com/docs', 'https://', 'not a url'])(
		'rejects a non-HTTPS or malformed destination: %s',
		(destination) => {
			const catalog = structuredClone(COMMUNITY_BINDING_GROUPS);
			catalog[0].entries[0].destination = destination;

			expect(() => validateCommunityBindingCatalog(catalog)).toThrow(/destination.*https/i);
		},
	);
});
