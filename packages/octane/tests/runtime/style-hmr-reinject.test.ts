import { describe, expect, it } from 'vitest';
import { injectStyle } from '../../src/index.js';

// Plan S3.6 — the client `injectStyle(id, css)` dedupes by id (a per-runtime
// Set plus a DOM query for `style[data-octane=id]`). A module re-evaluation
// that keeps a scope hash but changes the CSS (an HMR edit inside a block; the
// hash is position-derived) reaches the runtime as a second call with the same
// id. These tests pin what that second call does today.

let counter = 0;
function freshId(): string {
	counter += 1;
	return `tsrx-hmr-reinject-${counter}`;
}

function sheets(id: string): HTMLStyleElement[] {
	return Array.from(document.head.querySelectorAll(`style[data-octane="${id}"]`));
}

describe('injectStyle dedupe (S3.6)', () => {
	it('injects one <style data-octane> per id and ignores an identical repeat', () => {
		const id = freshId();
		const css = `.a.${id} { color: rgb(1, 1, 1); }`;
		injectStyle(id, css);
		injectStyle(id, css);
		const tags = sheets(id);
		expect(tags).toHaveLength(1);
		expect(tags[0].textContent).toBe(css);
	});

	it('adopts a server-emitted sheet instead of appending a duplicate', () => {
		const id = freshId();
		const serverCss = `.b.${id} { color: rgb(2, 2, 2); }`;
		const serverSheet = document.createElement('style');
		serverSheet.setAttribute('data-octane', id);
		serverSheet.textContent = serverCss;
		document.head.appendChild(serverSheet);

		injectStyle(id, `.b.${id} { color: rgb(3, 3, 3); }`);
		const tags = sheets(id);
		expect(tags).toHaveLength(1);
		expect(tags[0]).toBe(serverSheet);
		expect(tags[0].textContent).toBe(serverCss);
		serverSheet.remove();
	});

	it('current behavior: a second call with the same id but different css is ignored', () => {
		const id = freshId();
		const before = `.c.${id} { color: rgb(4, 4, 4); }`;
		const after = `.c.${id} { color: rgb(5, 5, 5); }`;
		injectStyle(id, before);
		injectStyle(id, after);
		const tags = sheets(id);
		expect(tags).toHaveLength(1);
		expect(tags[0].textContent).toBe(before);
	});

	// The dedupe hazard the plan describes: after an HMR re-evaluation the
	// scope hash is unchanged but its CSS is not, and the runtime keeps the
	// stale sheet. Recorded as a known failure — the runtime is not changed here.
	it.fails(
		'HMR hazard: re-injecting an unchanged hash with changed css should replace the sheet',
		() => {
			const id = freshId();
			const before = `.d.${id} { color: rgb(6, 6, 6); }`;
			const after = `.d.${id} { color: rgb(7, 7, 7); }`;
			injectStyle(id, before);
			injectStyle(id, after);
			const tags = sheets(id);
			expect(tags).toHaveLength(1);
			expect(tags[0].textContent).toBe(after);
		},
	);
});
