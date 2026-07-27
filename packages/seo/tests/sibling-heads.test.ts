// A nested component's <Head> must win, and it must not matter whether that
// block sits inside the outer one or beside it. Position-dependent precedence
// would be a trap: the sibling form is how the code reads naturally, and getting
// it wrong means a page silently keeps someone else's title.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, drainPassiveEffects, flushSync } from 'octane';
import { DistantSiblings, NestedHeads, SiblingHeads } from './_fixtures/sibling-heads.tsrx';

function settle(): void {
	flushSync(() => {});
	drainPassiveEffects();
	flushSync(() => {});
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	document.head.innerHTML = '';
	container = document.createElement('div');
	document.body.appendChild(container);
	root = createRoot(container);
	warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
	root.unmount();
	container.remove();
	document.head.innerHTML = '';
	warn.mockRestore();
});

const toggle = () => {
	container.querySelector<HTMLButtonElement>('#toggle')!.click();
	settle();
};
const titles = () => Array.from(document.head.querySelectorAll('title')).map((t) => t.textContent);

describe('a nested component rendering its own <Head>', () => {
	it('wins when its block is nested inside the outer one', () => {
		root.render(NestedHeads);
		settle();
		expect(titles()).toEqual(['XYZ']);

		toggle();

		expect(titles()).toEqual(['ZZZ']);
		expect(document.title).toBe('ZZZ');

		toggle();
		expect(titles()).toEqual(['XYZ']);
		expect(document.title).toBe('XYZ');
	});

	it('wins just the same when its block is a SIBLING of the outer one', () => {
		root.render(SiblingHeads);
		settle();
		expect(titles()).toEqual(['XYZ']);

		toggle();

		// One merged set, not one per <Head>, and the later registration wins.
		expect(titles()).toEqual(['ZZZ']);
		expect(document.title).toBe('ZZZ');

		toggle();
		expect(titles()).toEqual(['XYZ']);
		expect(document.title).toBe('XYZ');
	});

	it('merges blocks in unrelated components with no containment at all', () => {
		root.render(DistantSiblings);
		settle();
		expect(titles()).toEqual(['right']);
		expect(warn.mock.calls).toEqual([]);
	});

	it('never emits more than one merged set', () => {
		root.render(SiblingHeads);
		settle();
		toggle();
		expect(document.head.querySelectorAll('title')).toHaveLength(1);
		expect(warn.mock.calls).toEqual([]);
	});
});
