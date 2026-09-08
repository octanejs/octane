import { describe, expect, it } from 'vitest';
import communityBindingCatalog from '../src/content/community-bindings.json';
import {
	COMMUNITY_BINDING_GROUPS,
	validateCommunityBindingCatalog,
} from '../src/content/community-bindings.ts';

describe('community binding catalog', () => {
	it('exports the validated catalog without restating its editorial content', () => {
		expect(COMMUNITY_BINDING_GROUPS).toEqual(communityBindingCatalog);
	});

	it('takes editorial titles from the catalog', () => {
		const catalog = structuredClone(COMMUNITY_BINDING_GROUPS);
		catalog[0].title = 'TanStack adapters';

		expect(validateCommunityBindingCatalog(catalog)[0].title).toBe('TanStack adapters');
	});

	it('keeps stable group identities in their reviewed order', () => {
		const reordered = structuredClone(COMMUNITY_BINDING_GROUPS);
		[reordered[0], reordered[1]] = [reordered[1], reordered[0]];
		expect(() => validateCommunityBindingCatalog(reordered)).toThrow(/groups\[0\]\.id/i);

		const missingGroup = structuredClone(COMMUNITY_BINDING_GROUPS);
		missingGroup.pop();
		expect(() => validateCommunityBindingCatalog(missingGroup)).toThrow(/exactly 3 groups/i);
	});

	it('rejects duplicate stable IDs and normalized search names', () => {
		const duplicateId = structuredClone(COMMUNITY_BINDING_GROUPS);
		duplicateId[0].entries[1].id = duplicateId[0].entries[0].id;
		expect(() => validateCommunityBindingCatalog(duplicateId)).toThrow(
			/duplicate entry id.*tanstack-ai/i,
		);

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
