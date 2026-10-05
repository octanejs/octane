import { describe, it, expect } from 'vitest';
import { mount, act } from './_helpers';
import { SuspendedSingleRoot } from './_fixtures/suspended-single-root-order.tsrx';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => (resolve = done));
	return { promise, resolve };
}

/** Element and text markup, ignoring comments. */
function markup(container: Element): string {
	return container.innerHTML.replace(/<!--[^]*?-->/g, '');
}

describe('a branch arm that suspends inside its first component’s single root', () => {
	// The arm's first render stops inside Outer's <i>, before it reaches the
	// static sibling. When it resumes, that sibling renders after the root, in
	// source order.
	it('renders the arm’s later siblings after the root once it resumes', async () => {
		const a = deferred<string>();
		const r = mount(SuspendedSingleRoot, { a: a.promise });
		expect(r.container.querySelector('p')?.textContent).toBe('pending');

		await act(async () => {
			a.resolve('A');
			await a.promise;
		});

		expect(markup(r.container)).toBe('<i><s>A</s></i><em>e</em>');

		// The other arm replaces both roots, and the arm renders in order again.
		const b = deferred<string>();
		await act(() => r.root.render(SuspendedSingleRoot, { s: true, a: b.promise }));
		expect(markup(r.container)).toBe('<b>x</b>');
		await act(async () => {
			r.root.render(SuspendedSingleRoot, { a: b.promise });
			b.resolve('B');
			await b.promise;
		});
		expect(markup(r.container)).toBe('<i><s>B</s></i><em>e</em>');
		r.unmount();
	});
});
