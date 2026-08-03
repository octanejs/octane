// The heading→registry direction of the docs contract, shared by the generic
// route smoke suite and the focused Core APIs suite so both sides of every
// document are checked the same way.
//
// `docs-meta.ts` is not decoration: it drives the "On this page" tree, the
// sidebar reading order, and the section list the remote MCP server hands to
// agents. Nothing derives it from the MDX, so an `<h2>` added without a matching
// entry disappears from all three at once — and the registry→heading loops in
// the suites cannot see it, because every entry they hold still resolves.
import { expect } from 'vitest';
import type { DocMeta } from '../../src/content/docs-meta.ts';

/**
 * Assert that every `<h2 id>` the rendered document contains is registered in
 * `docs-meta.ts`.
 *
 * `<h3>` is deliberately not covered: a level-3 entry surfaces a subsection in
 * the table of contents, and whether a given subsection is worth surfacing is
 * the document's call. A top-level section is not — an unregistered one is
 * always a mistake.
 */
export function expectRegisteredHeadings(container: ParentNode, doc: DocMeta): void {
	const registered = new Set((doc.sections ?? []).map((section) => section.id));
	const rendered = Array.from(container.querySelectorAll<HTMLHeadingElement>('.prose h2[id]'));

	// Reported as the whole set rather than one id at a time, so adding several
	// sections at once names all of them in a single failure.
	const unregistered = rendered.map((heading) => heading.id).filter((id) => !registered.has(id));
	expect(unregistered, `${doc.slug}.mdx has <h2> sections missing from docs-meta.ts`).toEqual([]);
}
