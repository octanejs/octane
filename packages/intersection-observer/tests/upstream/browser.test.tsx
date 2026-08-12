/** @jsxImportSource octane */
// Adapted from react-intersection-observer@10.1.0 src/__tests__/browser.test.tsx
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, screen } from '@octanejs/testing-library';
import type { IntersectionOptions } from '../../src/index';
import { useInView } from '../../src/useInView.tsrx';

afterEach(function cleanupRender() {
	cleanup();
});

function HookComponent({ options }: { options?: IntersectionOptions }) {
	const [ref, inView] = useInView(options);

	return (
		<div
			ref={ref}
			data-testid="wrapper"
			style={{ height: 200, background: 'cyan' }}
			data-inview={String(inView)}
		>
			InView block
		</div>
	);
}

// Per upstream/src/__tests__/browser.test.tsx:24.
test('should come into view on after rendering', async function comesIntoViewAfterRendering() {
	render(<HookComponent />);
	const wrapper = screen.getByTestId('wrapper');
	await expect.element(wrapper).toHaveAttribute('data-inview', 'true');
});

// Per upstream/src/__tests__/browser.test.tsx:30.
test('should come into view after scrolling', async function comesIntoViewAfterScrolling() {
	render(
		<>
			<div style={{ height: window.innerHeight }} />
			<HookComponent />
			<div style={{ height: window.innerHeight }} />
		</>,
	);
	const wrapper = screen.getByTestId('wrapper');

	// Should not be inside the view
	expect(wrapper).toHaveAttribute('data-inview', 'false');

	// Scroll so the element comes into view
	window.scrollTo(0, window.innerHeight);
	// Should not be updated until intersection observer triggers
	expect(wrapper).toHaveAttribute('data-inview', 'false');

	await expect.element(wrapper).toHaveAttribute('data-inview', 'true');
});
