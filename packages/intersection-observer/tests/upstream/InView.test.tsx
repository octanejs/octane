/** @jsxImportSource octane */
// Adapted from react-intersection-observer@10.1.0 src/__tests__/InView.test.tsx
import { beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, render, screen } from '@octanejs/testing-library';
import { InView } from '../../src/InView.tsrx';
import { defaultFallbackInView } from '../../src/observe';
import {
	intersectionMockInstance,
	mockAllIsIntersecting,
	setupIntersectionMocking,
} from '../../src/test-utils';

beforeEach(function setupMocks() {
	setupIntersectionMocking(vi.fn);
});

// Per upstream/src/__tests__/InView.test.tsx:7.
test('Should render <InView /> intersecting', () => {
	const callback = vi.fn();
	render(
		<InView
			onChange={callback}
			children={function renderInView({
				inView,
				ref,
			}: {
				inView: boolean;
				ref(node: Element | null): void;
			}) {
				return <div ref={ref}>{inView.toString() as string}</div>;
			}}
		/>,
	);

	mockAllIsIntersecting(false);
	expect(callback).not.toHaveBeenCalled();

	mockAllIsIntersecting(true);
	expect(callback).toHaveBeenLastCalledWith(
		true,
		expect.objectContaining({ isIntersecting: true }),
	);

	mockAllIsIntersecting(false);
	expect(callback).toHaveBeenLastCalledWith(
		false,
		expect.objectContaining({ isIntersecting: false }),
	);
});

// Per upstream/src/__tests__/InView.test.tsx:31.
test('should render plain children', () => {
	render(<InView>inner</InView>);
	screen.getByText('inner');
});

// Per upstream/src/__tests__/InView.test.tsx:36.
test('should render as element', () => {
	const { container } = render(<InView as="span">inner</InView>);
	const tagName = container.children[0].tagName.toLowerCase();
	expect(tagName).toBe('span');
});

// Per upstream/src/__tests__/InView.test.tsx:42.
test('should render with className', () => {
	const { container } = render(<InView className="inner-class">inner</InView>);
	expect(container.children[0].className).toBe('inner-class');
});

// Per upstream/src/__tests__/InView.test.tsx:47.
test('Should respect skip', () => {
	const cb = vi.fn();
	render(
		<InView skip onChange={cb}>
			inner
		</InView>,
	);
	mockAllIsIntersecting(true);

	expect(cb).not.toHaveBeenCalled();
});

// Per upstream/src/__tests__/InView.test.tsx:59.
test('Should handle initialInView', () => {
	const cb = vi.fn();
	render(
		<InView
			initialInView
			onChange={cb}
			children={function renderInView({ inView }: { inView: boolean }) {
				return <span>InView: {inView.toString() as string}</span>;
			}}
		/>,
	);
	screen.getByText('InView: true');
});

// Per upstream/src/__tests__/InView.test.tsx:69.
test('Should unobserve old node', () => {
	const { rerender } = render(
		<InView
			children={function renderInView({
				inView,
				ref,
			}: {
				inView: boolean;
				ref(node: Element | null): void;
			}) {
				return (
					<div key="1" ref={ref}>
						Inview: {inView.toString() as string}
					</div>
				);
			}}
		/>,
	);
	rerender(
		<InView
			children={function renderInView({
				inView,
				ref,
			}: {
				inView: boolean;
				ref(node: Element | null): void;
			}) {
				return (
					<div key="2" ref={ref}>
						Inview: {inView.toString() as string}
					</div>
				);
			}}
		/>,
	);
	mockAllIsIntersecting(true);
});

// Per upstream/src/__tests__/InView.test.tsx:91.
test('Should ensure node exists before observing and unobserving', () => {
	const { unmount } = render(
		<InView
			children={function renderEmpty() {
				return null;
			}}
		/>,
	);
	unmount();
});

// Per upstream/src/__tests__/InView.test.tsx:96.
test('Should recreate observer when threshold change', () => {
	const { container, rerender } = render(<InView>Inner</InView>);
	mockAllIsIntersecting(true);
	const instance = intersectionMockInstance(container.children[0]);
	vi.spyOn(instance, 'unobserve');

	rerender(<InView threshold={0.5}>Inner</InView>);
	expect(instance.unobserve).toHaveBeenCalled();
});

// Per upstream/src/__tests__/InView.test.tsx:106.
test('Should recreate observer when root change', () => {
	const { container, rerender } = render(<InView>Inner</InView>);
	mockAllIsIntersecting(true);
	const instance = intersectionMockInstance(container.children[0]);
	vi.spyOn(instance, 'unobserve');

	const root = document.createElement('div');
	rerender(<InView root={root}>Inner</InView>);
	expect(instance.unobserve).toHaveBeenCalled();
});

// Per upstream/src/__tests__/InView.test.tsx:117.
test('Should recreate observer when rootMargin change', () => {
	const { container, rerender } = render(<InView>Inner</InView>);
	mockAllIsIntersecting(true);
	const instance = intersectionMockInstance(container.children[0]);
	vi.spyOn(instance, 'unobserve');

	rerender(<InView rootMargin="10px">Inner</InView>);
	expect(instance.unobserve).toHaveBeenCalled();
});

// Per upstream/src/__tests__/InView.test.tsx:127.
test('Should recreate observer when scrollMargin change', () => {
	const { container, rerender } = render(<InView>Inner</InView>);
	mockAllIsIntersecting(true);
	const instance = intersectionMockInstance(container.children[0]);
	vi.spyOn(instance, 'unobserve');

	rerender(<InView scrollMargin="10px">Inner</InView>);
	expect(instance.unobserve).toHaveBeenCalled();
});

// Per upstream/src/__tests__/InView.test.tsx:137.
test('Should unobserve when triggerOnce comes into view', () => {
	const { container } = render(<InView triggerOnce>Inner</InView>);
	mockAllIsIntersecting(false);
	const instance = intersectionMockInstance(container.children[0]);
	vi.spyOn(instance, 'unobserve');
	mockAllIsIntersecting(true);

	expect(instance.unobserve).toHaveBeenCalled();
});

// Per upstream/src/__tests__/InView.test.tsx:147.
test('Should unobserve when unmounted', () => {
	const { container, unmount } = render(<InView triggerOnce>Inner</InView>);
	const instance = intersectionMockInstance(container.children[0]);

	vi.spyOn(instance, 'unobserve');

	unmount();

	expect(instance.unobserve).toHaveBeenCalled();
});

// Per upstream/src/__tests__/InView.test.tsx:158.
test('plain children should not catch bubbling onChange event', async () => {
	const onChange = vi.fn();
	const { getByLabelText } = render(
		<InView onChange={onChange}>
			<label>
				<input name="field" />
				input
			</label>
		</InView>,
	);
	const input = getByLabelText('input');
	input.focus();
	(input as HTMLInputElement).value = 'changed value';
	input.dispatchEvent(new Event('input', { bubbles: true }));
	input.dispatchEvent(new Event('change', { bubbles: true }));
	expect(onChange).not.toHaveBeenCalled();
});

// Per upstream/src/__tests__/InView.test.tsx:173.
test('should render with fallback', async function shouldRenderWithFallback() {
	const cb = vi.fn();
	// @ts-expect-error
	window.IntersectionObserver = undefined;
	render(
		<InView fallbackInView={true} onChange={cb}>
			Inner
		</InView>,
	);
	expect(cb).toHaveBeenLastCalledWith(true, expect.objectContaining({ isIntersecting: true }));

	cleanup();
	cb.mockClear();
	// @ts-expect-error keep the unsupported probe active across remounts
	window.IntersectionObserver = undefined;
	render(
		<InView fallbackInView={false} onChange={cb}>
			Inner
		</InView>,
	);
	// OCTANE DIVERGENCE[intersection-observer-initial-false-onchange][runtime:87f04d520e6196ac]: Upstream class InView often observes twice under React, so the skipped initial-false gate then lets a second false notification reach onChange. Octane observes once, so the documented initial-false skip applies.
	expect(cb).not.toHaveBeenCalled();

	cleanup();
	// @ts-expect-error
	window.IntersectionObserver = undefined;
	const seen: unknown[] = [];
	const spy = vi.spyOn(console, 'error').mockImplementation(function capture(arg) {
		seen.push(arg);
	});
	try {
		// Public InView path (not observe()): Octane reports unsupported IO via effect console.error.
		// Documented with intersection-observer-unsupported-mount-error-surface; this case id is
		// already bound to intersection-observer-initial-false-onchange above.
		await act(function mountUnsupported() {
			render(<InView onChange={cb}>Inner</InView>);
		});
		expect(String(seen[0])).toMatch(/IntersectionObserver is not a constructor/);
	} finally {
		spy.mockRestore();
	}
});

// Per upstream/src/__tests__/InView.test.tsx:205.
test('should render with global fallback', async function shouldRenderWithGlobalFallback() {
	const cb = vi.fn();
	// @ts-expect-error
	window.IntersectionObserver = undefined;
	defaultFallbackInView(true);
	render(<InView onChange={cb}>Inner</InView>);
	expect(cb).toHaveBeenLastCalledWith(true, expect.objectContaining({ isIntersecting: true }));

	cleanup();
	cb.mockClear();
	// @ts-expect-error keep the unsupported probe active across remounts
	window.IntersectionObserver = undefined;
	defaultFallbackInView(false);
	render(<InView onChange={cb}>Inner</InView>);
	// OCTANE DIVERGENCE[intersection-observer-initial-false-onchange][runtime:87f04d520e6196ac]: Same initial-false skip as the prop fallback case.
	expect(cb).not.toHaveBeenCalled();

	cleanup();
	// @ts-expect-error
	window.IntersectionObserver = undefined;
	defaultFallbackInView(undefined);
	const seen: unknown[] = [];
	const spy = vi.spyOn(console, 'error').mockImplementation(function capture(arg) {
		seen.push(arg);
	});
	try {
		// Public InView path: same effect-phase console.error surface as the prop fallback case.
		await act(function mountUnsupportedGlobal() {
			render(<InView onChange={cb}>Inner</InView>);
		});
		expect(String(seen[0])).toMatch(/IntersectionObserver is not a constructor/);
	} finally {
		spy.mockRestore();
	}
});
