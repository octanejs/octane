import { describe, expect, it, vi } from 'vitest';
import { hydrateRoot } from 'octane';
import { ButtonAsChildFixture, SkeletonFixture, TableFixture } from './_fixtures/tier1-app.tsrx';

// Server HTML captured from the shadcn-ssr project's renderToString output for
// the same fixtures (the framework-marker comments are hydration input, not an
// asserted contract).
const SERVER = {
	skeleton: '<div data-slot="skeleton" class="cn-skeleton animate-pulse h-4"></div>',
	buttonAsChild:
		'<!--[--><!--[--><!--[--><!--[--><!--[--><a href="#docs" data-slot="button" data-variant="outline" data-size="lg" class="cn-button group/button inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-all outline-none select-none disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg]:shrink-0 cn-button-variant-outline cn-button-size-lg">Docs</a><!--]--><!--]--><!--]--><!--]--><!--]-->',
	table:
		'<div data-slot="table-container" class="cn-table-container"><table data-slot="table" class="cn-table mine"><!--[--><!--[--><caption data-slot="table-caption" class="cn-table-caption"><!--[-->People<!--]--></caption><!--]--><!--[--><thead data-slot="table-header" class="cn-table-header"><!--[--><!--[--><tr data-slot="table-row" class="cn-table-row has-aria-expanded:bg-muted/50"><!--[--><!--[--><th data-slot="table-head" class="cn-table-head"><!--[-->Name<!--]--></th><!--]--><!--]--></tr><!--]--><!--]--></thead><!--]--><!--[--><tbody data-slot="table-body" class="cn-table-body"><!--[--><!--[--><tr data-slot="table-row" class="cn-table-row has-aria-expanded:bg-muted/50"><!--[--><!--[--><td data-slot="table-cell" class="cn-table-cell"><!--[-->Ada<!--]--></td><!--]--><!--]--></tr><!--]--><!--]--></tbody><!--]--><!--]--></table></div>',
} as const;

function hydrate(serverHtml: string, body: () => unknown) {
	const container = document.createElement('div');
	container.innerHTML = serverHtml;
	document.body.appendChild(container);
	const error = vi.spyOn(console, 'error').mockImplementation(() => {});
	const root = hydrateRoot(container, body as any);
	return { container, error, root };
}

describe('@octanejs/shadcn — hydration adoption (Tier 1)', () => {
	it('adopts a plain host (Skeleton) without mismatch and preserves node identity', () => {
		const { container, error, root } = hydrate(SERVER.skeleton, SkeletonFixture);
		const serverNode = container.querySelector('[data-slot="skeleton"]');
		expect(serverNode).not.toBeNull();
		expect(error).not.toHaveBeenCalled();
		expect(container.querySelector('[data-slot="skeleton"]')).toBe(serverNode);
		root.unmount();
		error.mockRestore();
		container.remove();
	});

	it('adopts a Slot-composed host (Button asChild → anchor) without mismatch', () => {
		const { container, error, root } = hydrate(SERVER.buttonAsChild, ButtonAsChildFixture);
		const anchor = container.querySelector('a[data-slot="button"]');
		expect(anchor).not.toBeNull();
		expect(error).not.toHaveBeenCalled();
		expect(container.querySelector('a[data-slot="button"]')).toBe(anchor);
		expect(anchor!.textContent).toBe('Docs');
		expect(anchor!.getAttribute('data-variant')).toBe('outline');
		root.unmount();
		error.mockRestore();
		container.remove();
	});

	it('adopts a nested wrapper tree (Table) without mismatch and keeps every part', () => {
		const { container, error, root } = hydrate(SERVER.table, TableFixture);
		const table = container.querySelector('[data-slot="table"]');
		const cell = container.querySelector('[data-slot="table-cell"]');
		expect(error).not.toHaveBeenCalled();
		expect(container.querySelector('[data-slot="table"]')).toBe(table);
		expect(cell!.textContent).toBe('Ada');
		expect(container.querySelector('[data-slot="table-container"]')!.contains(table)).toBe(true);
		root.unmount();
		error.mockRestore();
		container.remove();
	});
});
