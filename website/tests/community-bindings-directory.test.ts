import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@octanejs/testing-library';
import { CommunityBindingsDirectory } from '../src/components/CommunityBindingsDirectory.tsrx';
import { COMMUNITY_BINDING_GROUPS } from '../src/content/community-bindings.ts';

afterEach(cleanup);

describe('CommunityBindingsDirectory', () => {
	it('renders the curated catalog as grouped external links', () => {
		const { container } = render(CommunityBindingsDirectory as any);
		const cards = Array.from(container.querySelectorAll<HTMLElement>('.community-binding-card'));

		expect(cards).toHaveLength(COMMUNITY_BINDING_GROUPS.length);
		for (let groupIndex = 0; groupIndex < COMMUNITY_BINDING_GROUPS.length; groupIndex++) {
			const group = COMMUNITY_BINDING_GROUPS[groupIndex];
			const card = cards[groupIndex];
			expect(card.querySelector('h3')?.textContent?.trim()).toBe(group.title);
			expect(card.querySelector('.community-binding-count')?.textContent?.trim()).toBe(
				`${group.entries.length}+ ${group.entries.length === 1 ? 'binding' : 'bindings'}`,
			);

			const links = Array.from(
				card.querySelectorAll<HTMLAnchorElement>('a.community-binding-link'),
			);
			expect(links).toHaveLength(group.entries.length);
			for (let entryIndex = 0; entryIndex < group.entries.length; entryIndex++) {
				const entry = group.entries[entryIndex];
				const link = links[entryIndex];
				expect(link.textContent?.trim()).toBe(entry.searchNames[0]);
				expect(link.getAttribute('href')).toBe(entry.destination);
				expect(link.getAttribute('aria-label')).toBe(
					`Open ${entry.name} official documentation in a new tab`,
				);
				expect(link.target).toBe('_blank');
				expect(link.rel).toBe('noreferrer');
			}
		}
	});
});
