/**
 * `render()` conformance — ports of react-testing-library's own render tests
 * (react-testing-library@be9d81d, src/__tests__/render.js + multi-base.js +
 * rerender.js + act.js), re-authored against octane components. React-only
 * behaviors (StrictMode double-render, legacyRoot) have no octane equivalent
 * and are out of scope by design.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createElement } from 'octane';
import { render, cleanup, screen } from '@octanejs/testing-library';
import { Greeting, Message, OtherMessage, MainWrapper } from './_fixtures/basic.tsrx';
import { EffectLogger, DeferredLabel } from './_fixtures/effects.tsrx';

afterEach(cleanup);

describe('render', () => {
	// Per react-testing-library src/__tests__/render.js:28 ("renders div into document")
	it('renders a host element into the document', () => {
		const { container } = render(createElement('div', { id: 'whatever' }, 'hello'));
		// A lone host descriptor at the root renders ANCHORLESS (no comment
		// markers), so RTL's ubiquitous `container.firstChild` idiom holds.
		expect((container.firstChild as HTMLElement).id).toBe('whatever');
		expect(container.textContent).toBe('hello');
		expect(document.body.contains(container)).toBe(true);
	});

	// Octane form: components are values in plain-.ts tests, so props travel in
	// the options bag (no JSX to inline them).
	it('renders a component with the (Component, {props}) form', () => {
		const { container } = render(Greeting, { props: { name: 'Ada' } });
		expect(container.textContent).toBe('Hello, Ada!');
	});

	// ...and the RTL-style element-descriptor form.
	it('renders a component from a createElement descriptor', () => {
		const { container } = render(createElement(Greeting, { name: 'Grace' }));
		expect(container.textContent).toBe('Hello, Grace!');
	});

	// Per render.js:73 ("returns baseElement which defaults to document.body")
	it('returns baseElement which defaults to document.body', () => {
		const { baseElement } = render(Message, { props: { text: 'hi' } });
		expect(baseElement).toBe(document.body);
	});

	// Per multi-base.js:18 ("baseElement isolates trees from one another")
	it('baseElement isolates trees from one another', () => {
		const treeA = document.body.appendChild(document.createElement('div'));
		const treeB = document.body.appendChild(document.createElement('div'));
		const a = render(Message, { props: { text: 'alpha' }, baseElement: treeA });
		const b = render(OtherMessage, { props: { text: 'beta' }, baseElement: treeB });
		expect(a.getByTestId('message').textContent).toBe('alpha');
		expect(a.queryByTestId('other')).toBeNull();
		expect(b.getByTestId('other').textContent).toBe('beta');
		expect(b.queryByTestId('message')).toBeNull();
		treeA.remove();
		treeB.remove();
	});

	it('renders into a caller-supplied container', () => {
		const container = document.body.appendChild(document.createElement('section'));
		const result = render(Message, { props: { text: 'contained' }, container });
		expect(result.container).toBe(container);
		expect(container.querySelector('[data-testid="message"]')!.textContent).toBe('contained');
	});

	// Per render.js:93 ("renders options.wrapper around node")
	it('renders options.wrapper around the node', () => {
		const { container, getByTestId } = render(Message, {
			props: { text: 'wrapped' },
			wrapper: MainWrapper,
		});
		expect(getByTestId('wrapper')).toBeTruthy();
		expect((container.firstChild as HTMLElement).tagName).toBe('MAIN');
		expect(getByTestId('wrapper').contains(getByTestId('message'))).toBe(true);
	});

	// Per act.js:4 ("render calls useEffect immediately")
	it('commits useEffect (and the re-renders it schedules) before returning', () => {
		const { getByTestId } = render(DeferredLabel);
		expect(getByTestId('label').textContent).toBe('committed');
	});

	// Per render.js:149 ("flushes useEffect cleanup functions sync on unmount()")
	it('flushes useEffect cleanup functions sync on unmount()', () => {
		const log = vi.fn();
		const { unmount } = render(EffectLogger, { props: { log } });
		expect(log.mock.calls).toEqual([['mount']]);
		unmount();
		expect(log.mock.calls).toEqual([['mount'], ['cleanup']]);
	});

	// Per render.js:163 ("can be called multiple times on the same container")
	it('can be called multiple times on the same container (root reuse)', () => {
		const container = document.body.appendChild(document.createElement('div'));
		render(Message, { props: { text: 'first' }, container });
		const { getByTestId, queryByTestId } = render(OtherMessage, {
			props: { text: 'second' },
			container,
		});
		// A different component on the same container tears down and remounts.
		expect(queryByTestId('message')).toBeNull();
		expect(getByTestId('other').textContent).toBe('second');
	});

	// Per render.js:78 ("supports fragments") — the asFragment surface.
	it('asFragment returns a detached snapshot of the container', () => {
		const { asFragment, rerender } = render(Message, { props: { text: 'before' } });
		const frag = asFragment();
		expect((frag.querySelector('[data-testid="message"]') as HTMLElement).textContent).toBe(
			'before',
		);
		// The fragment is a snapshot — later rerenders don't mutate it.
		rerender(Message, { text: 'after' });
		expect((frag.querySelector('[data-testid="message"]') as HTMLElement).textContent).toBe(
			'before',
		);
	});

	it('binds all dom-testing-library queries to baseElement (screen works)', () => {
		render(Greeting, { props: { name: 'screen' } });
		expect(screen.getByText('Hello, screen!')).toBeTruthy();
	});
});

describe('rerender', () => {
	// Per rerender.js:20 ("rerender will re-render the element")
	it('re-renders the same component with new props in place', () => {
		const { container, rerender } = render(Greeting, { props: { name: 'first' } });
		const node = container.firstChild;
		expect(container.textContent).toBe('Hello, first!');
		rerender(Greeting, { name: 'second' });
		expect(container.textContent).toBe('Hello, second!');
		// Same component identity → the DOM node was updated, not replaced.
		expect(container.firstChild).toBe(node);
	});

	it('accepts an element descriptor, like render', () => {
		const { container, rerender } = render(createElement(Greeting, { name: 'x' }));
		rerender(createElement(Greeting, { name: 'y' }));
		expect(container.textContent).toBe('Hello, y!');
	});

	// Per rerender.js:50 (wrapper re-applied on rerender)
	it('re-applies options.wrapper on rerender', () => {
		const { container, rerender, getByTestId } = render(Message, {
			props: { text: 'a' },
			wrapper: MainWrapper,
		});
		rerender(Message, { text: 'b' });
		expect((container.firstChild as HTMLElement).tagName).toBe('MAIN');
		expect(getByTestId('message').textContent).toBe('b');
	});
});
