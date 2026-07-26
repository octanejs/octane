import { describe, expect, it, vi } from 'vitest';
import { hydrateRoot } from 'octane';
import { ButtonAsChildFixture, SkeletonFixture, TableFixture } from './_fixtures/tier1-app.tsrx';

// Server HTML captured from the shadcn-ssr project's renderToString output for
// the same fixtures (the framework-marker comments are hydration input, not an
// asserted contract).
const SERVER = {
	skeleton: '<div data-slot="skeleton" class="animate-pulse rounded-md bg-accent h-4"></div>',
	buttonAsChild:
		'<!--[--><!--[--><!--[--><!--[--><!--[--><a href="#docs" data-slot="button" class="group/button inline-flex shrink-0 items-center justify-center rounded-lg border bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&amp;_svg]:pointer-events-none [&amp;_svg]:shrink-0 [&amp;_svg:not([class*=\'size-\'])]:size-4 border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50 h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2">Docs</a><!--]--><!--]--><!--]--><!--]--><!--]-->',
	table:
		'<div data-slot="table-container" class="relative w-full overflow-x-auto"><table data-slot="table" class="w-full caption-bottom text-sm mine"><!--[--><!--[--><caption data-slot="table-caption" class="text-muted-foreground mt-4 text-sm"><!--[-->People<!--]--></caption><!--]--><!--[--><thead data-slot="table-header" class="[&amp;_tr]:border-b"><!--[--><!--[--><tr data-slot="table-row" class="border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted"><!--[--><!--[--><th data-slot="table-head" class="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap [&amp;:has([role=checkbox])]:pr-0 [&amp;>[role=checkbox]]:translate-y-[2px]"><!--[-->Name<!--]--></th><!--]--><!--]--></tr><!--]--><!--]--></thead><!--]--><!--[--><tbody data-slot="table-body" class="[&amp;_tr:last-child]:border-0"><!--[--><!--[--><tr data-slot="table-row" class="border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted"><!--[--><!--[--><td data-slot="table-cell" class="p-2 align-middle whitespace-nowrap [&amp;:has([role=checkbox])]:pr-0 [&amp;>[role=checkbox]]:translate-y-[2px]"><!--[-->Ada<!--]--></td><!--]--><!--]--></tr><!--]--><!--]--></tbody><!--]--><!--]--></table></div>',
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
		// The default-Tailwind button flavor carries the variant in its classes,
		// not a data-variant attribute.
		expect(anchor!.className).toContain('bg-background');
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
