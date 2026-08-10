/** @jsxImportSource octane */
// Adapted from react-intersection-observer@10.1.0 src/__tests__/useInView.test.tsx
import { beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, render, screen } from '@octanejs/testing-library';
import { useCallback, useEffect, useState } from 'octane';
import { defaultFallbackInView, type IntersectionOptions } from '../../src/index';
import {
	destroyIntersectionMocking,
	intersectionMockInstance,
	mockAllIsIntersecting,
	mockIsIntersecting,
	setupIntersectionMocking,
} from '../../src/test-utils';
import { useInView } from '../../src/useInView.tsrx';

beforeEach(function setupMocks() {
	setupIntersectionMocking(vi.fn);
});

const HookComponent = ({
	options,
	unmount,
}: {
	options?: IntersectionOptions;
	unmount?: boolean;
}) => {
	const [ref, inView] = useInView(options);
	return (
		<div data-testid="wrapper" ref={!unmount ? ref : undefined}>
			{inView.toString()}
		</div>
	);
};

const LazyHookComponent = ({ options }: { options?: IntersectionOptions }) => {
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		setIsLoading(false);
	}, []);
	const [ref, inView] = useInView(options);
	if (isLoading) return <div>Loading</div>;
	return (
		<div data-testid="wrapper" ref={ref}>
			{inView.toString()}
		</div>
	);
};

// Per upstream/src/__tests__/useInView.test.tsx:42.
test('should create a hook', () => {
	const { getByTestId } = render(<HookComponent />);
	const wrapper = getByTestId('wrapper');
	const instance = intersectionMockInstance(wrapper);

	expect(instance.observe).toHaveBeenCalledWith(wrapper);
});

// Per upstream/src/__tests__/useInView.test.tsx:50.
test('should create a hook with array threshold', () => {
	const { getByTestId } = render(<HookComponent options={{ threshold: [0.1, 1] }} />);
	const wrapper = getByTestId('wrapper');
	const instance = intersectionMockInstance(wrapper);

	expect(instance.observe).toHaveBeenCalledWith(wrapper);
});

// Per upstream/src/__tests__/useInView.test.tsx:60.
test('should create a hook with scrollMargin', () => {
	const { getByTestId } = render(<HookComponent options={{ scrollMargin: '10px' }} />);
	const wrapper = getByTestId('wrapper');
	const instance = intersectionMockInstance(wrapper);

	expect(instance).toHaveProperty('scrollMargin', '10px');
});

// Per upstream/src/__tests__/useInView.test.tsx:70.
test('should create a lazy hook', () => {
	const { getByTestId } = render(<LazyHookComponent />);
	const wrapper = getByTestId('wrapper');
	const instance = intersectionMockInstance(wrapper);

	expect(instance.observe).toHaveBeenCalledWith(wrapper);
});

// Per upstream/src/__tests__/useInView.test.tsx:78.
test('should create a hook inView', () => {
	const { getByText } = render(<HookComponent />);
	mockAllIsIntersecting(true);

	getByText('true');
});

// Per upstream/src/__tests__/useInView.test.tsx:85.
test('should mock thresholds', () => {
	render(<HookComponent options={{ threshold: [0.5, 1] }} />);
	mockAllIsIntersecting(0.2);
	screen.getByText('false');
	mockAllIsIntersecting(0.5);
	screen.getByText('true');
	mockAllIsIntersecting(1);
	screen.getByText('true');
});

// Per upstream/src/__tests__/useInView.test.tsx:95.
test('should create a hook with initialInView', () => {
	const { getByText } = render(<HookComponent options={{ initialInView: true }} />);
	getByText('true');
	mockAllIsIntersecting(false);
	getByText('false');
});

// Per upstream/src/__tests__/useInView.test.tsx:104.
test('should trigger a hook leaving view', () => {
	const { getByText } = render(<HookComponent />);
	mockAllIsIntersecting(true);
	mockAllIsIntersecting(false);
	getByText('false');
});

// Per upstream/src/__tests__/useInView.test.tsx:111.
test('should respect trigger once', () => {
	const { getByText } = render(<HookComponent options={{ triggerOnce: true }} />);
	mockAllIsIntersecting(true);
	mockAllIsIntersecting(false);

	getByText('true');
});

// Per upstream/src/__tests__/useInView.test.tsx:121.
test('should trigger onChange', () => {
	const onChange = vi.fn();
	render(<HookComponent options={{ onChange }} />);

	mockAllIsIntersecting(false);
	expect(onChange).not.toHaveBeenCalled();

	mockAllIsIntersecting(true);
	expect(onChange).toHaveBeenLastCalledWith(
		true,
		expect.objectContaining({ intersectionRatio: 1, isIntersecting: true }),
	);

	mockAllIsIntersecting(false);
	expect(onChange).toHaveBeenLastCalledWith(
		false,
		expect.objectContaining({ intersectionRatio: 0, isIntersecting: false }),
	);
});

// Per upstream/src/__tests__/useInView.test.tsx:141.
test('should respect skip', () => {
	const { getByText, rerender } = render(<HookComponent options={{ skip: true }} />);
	mockAllIsIntersecting(false);
	getByText('false');

	rerender(<HookComponent options={{ skip: false }} />);
	mockAllIsIntersecting(true);
	getByText('true');
});

// Per upstream/src/__tests__/useInView.test.tsx:153.
test('should not reset current state if changing skip', () => {
	const { getByText, rerender } = render(<HookComponent options={{ skip: false }} />);
	mockAllIsIntersecting(true);
	rerender(<HookComponent options={{ skip: true }} />);
	getByText('true');
});

// Per upstream/src/__tests__/useInView.test.tsx:162.
test('should unmount the hook', () => {
	const { unmount, getByTestId } = render(<HookComponent />);
	const wrapper = getByTestId('wrapper');
	const instance = intersectionMockInstance(wrapper);
	unmount();
	expect(instance.unobserve).toHaveBeenCalledWith(wrapper);
});

// Per upstream/src/__tests__/useInView.test.tsx:170.
test('inView should be false when component is unmounted', () => {
	const { rerender, getByText } = render(<HookComponent />);
	mockAllIsIntersecting(true);

	getByText('true');
	rerender(<HookComponent unmount />);
	getByText('false');
});

// Per upstream/src/__tests__/useInView.test.tsx:179.
test('should handle trackVisibility', () => {
	render(<HookComponent options={{ trackVisibility: true, delay: 100 }} />);
	mockAllIsIntersecting(true);
});

// Per upstream/src/__tests__/useInView.test.tsx:184.
test('should handle trackVisibility when unsupported', () => {
	render(<HookComponent options={{ trackVisibility: true, delay: 100 }} />);
});

const SwitchHookComponent = ({
	options,
	toggle,
	unmount,
}: {
	options?: IntersectionOptions;
	toggle?: boolean;
	unmount?: boolean;
}) => {
	const [ref, inView] = useInView(options);
	return (
		<>
			<div
				data-testid="item-1"
				data-inview={(!toggle && inView).toString()}
				ref={!toggle && !unmount ? ref : undefined}
			/>
			<div
				data-testid="item-2"
				data-inview={(!!toggle && inView).toString()}
				ref={toggle && !unmount ? ref : undefined}
			/>
		</>
	);
};

/**
 * This is a test for the case where people move the ref around (please don't)
 */
// Per upstream/src/__tests__/useInView.test.tsx:217.
test('should handle ref removed', () => {
	const { rerender, getByTestId } = render(<SwitchHookComponent />);
	mockAllIsIntersecting(true);

	const item1 = getByTestId('item-1');
	const item2 = getByTestId('item-2');

	// Item1 should be inView
	expect(item1.getAttribute('data-inview')).toBe('true');
	expect(item2.getAttribute('data-inview')).toBe('false');

	rerender(<SwitchHookComponent toggle />);
	mockAllIsIntersecting(true);

	// Item2 should be inView
	expect(item1.getAttribute('data-inview')).toBe('false');
	expect(item2.getAttribute('data-inview')).toBe('true');

	rerender(<SwitchHookComponent unmount />);

	// Nothing should be inView
	expect(item1.getAttribute('data-inview')).toBe('false');
	expect(item2.getAttribute('data-inview')).toBe('false');

	// Add the ref back
	rerender(<SwitchHookComponent />);
	mockAllIsIntersecting(true);
	expect(item1.getAttribute('data-inview')).toBe('true');
	expect(item2.getAttribute('data-inview')).toBe('false');
});

const MergeRefsComponent = ({ options }: { options?: IntersectionOptions }) => {
	const [inViewRef, inView] = useInView(options);
	const setRef = useCallback(
		(node: Element | null) => {
			inViewRef(node);
		},
		[inViewRef],
	);

	return <div data-testid="inview" data-inview={inView} ref={setRef} />;
};

// Per upstream/src/__tests__/useInView.test.tsx:260.
test('should handle ref merged', () => {
	const { rerender, getByTestId } = render(<MergeRefsComponent />);
	mockAllIsIntersecting(true);
	rerender(<MergeRefsComponent />);

	expect(getByTestId('inview').getAttribute('data-inview')).toBe('true');
});

const MultipleHookComponent = ({ options }: { options?: IntersectionOptions }) => {
	const [ref1, inView1] = useInView(options);
	const [ref2, inView2] = useInView(options);
	const [ref3, inView3] = useInView();

	const mergedRefs = useCallback(
		(node: Element | null) => {
			ref1(node);
			ref2(node);
			ref3(node);
		},
		[ref1, ref2, ref3],
	);

	return (
		<div ref={mergedRefs}>
			<div data-testid="item-1" data-inview={inView1}>
				{inView1}
			</div>
			<div data-testid="item-2" data-inview={inView2}>
				{inView2}
			</div>
			<div data-testid="item-3" data-inview={inView3}>
				{inView3}
			</div>
		</div>
	);
};

// Per upstream/src/__tests__/useInView.test.tsx:301.
test('should handle multiple hooks on the same element', () => {
	const { getByTestId } = render(<MultipleHookComponent options={{ threshold: 0.1 }} />);
	mockAllIsIntersecting(true);
	expect(getByTestId('item-1').getAttribute('data-inview')).toBe('true');
	expect(getByTestId('item-2').getAttribute('data-inview')).toBe('true');
	expect(getByTestId('item-3').getAttribute('data-inview')).toBe('true');
});

// Per upstream/src/__tests__/useInView.test.tsx:311.
test('should handle thresholds missing on observer instance', () => {
	render(<HookComponent options={{ threshold: [0.1, 1] }} />);
	const wrapper = screen.getByTestId('wrapper');
	const instance = intersectionMockInstance(wrapper);
	// @ts-expect-error
	instance.thresholds = undefined;
	mockAllIsIntersecting(true);

	screen.getByText('true');
});

// Per upstream/src/__tests__/useInView.test.tsx:322.
test('should handle thresholds missing on observer instance with no threshold set', () => {
	render(<HookComponent />);
	const wrapper = screen.getByTestId('wrapper');
	const instance = intersectionMockInstance(wrapper);
	// @ts-expect-error
	instance.thresholds = undefined;
	mockAllIsIntersecting(true);

	screen.getByText('true');
});

const HookComponentWithEntry = ({
	options,
	unmount,
}: {
	options?: IntersectionOptions;
	unmount?: boolean;
}) => {
	const { ref, entry } = useInView(options);
	return (
		<div data-testid="wrapper" ref={!unmount ? ref : undefined}>
			{entry && Object.entries(entry).map(([key, value]) => `${key}: ${value}`)}
		</div>
	);
};

// Per upstream/src/__tests__/useInView.test.tsx:348.
test('should set intersection ratio as the largest threshold smaller than trigger', () => {
	render(<HookComponentWithEntry options={{ threshold: [0, 0.25, 0.5, 0.75, 1] }} />);
	const wrapper = screen.getByTestId('wrapper');

	mockIsIntersecting(wrapper, 0.5);
	screen.getByText(/intersectionRatio: 0.5/);
});

// Per upstream/src/__tests__/useInView.test.tsx:358.
test('should handle fallback if unsupported', async function shouldHandleFallbackIfUnsupported() {
	destroyIntersectionMocking();
	// @ts-expect-error
	window.IntersectionObserver = undefined;
	const { rerender } = render(<HookComponent options={{ fallbackInView: true }} />);
	screen.getByText('true');

	rerender(<HookComponent options={{ fallbackInView: false }} />);
	screen.getByText('false');

	const seen: unknown[] = [];
	const spy = vi.spyOn(console, 'error').mockImplementation(function capture(arg) {
		seen.push(arg);
	});
	try {
		// OCTANE DIVERGENCE[intersection-observer-unsupported-mount-error-surface][runtime:4ded56f226061c62]: Upstream rerender throws synchronously; Octane observes in a passive effect and reports via console.error.
		await act(function remountUnsupported() {
			rerender(<HookComponent options={{ fallbackInView: undefined }} />);
		});
		expect(String(seen[0])).toMatch(/IntersectionObserver is not a constructor/);
	} finally {
		spy.mockRestore();
	}
});

// Per upstream/src/__tests__/useInView.test.tsx:380.
test('should handle defaultFallbackInView if unsupported', async function shouldHandleDefaultFallbackIfUnsupported() {
	destroyIntersectionMocking();
	// @ts-expect-error
	window.IntersectionObserver = undefined;
	defaultFallbackInView(true);
	const { rerender } = render(<HookComponent key="true" />);
	screen.getByText('true');

	defaultFallbackInView(false);
	rerender(<HookComponent key="false" />);
	screen.getByText('false');

	defaultFallbackInView(undefined);
	const seen: unknown[] = [];
	const spy = vi.spyOn(console, 'error').mockImplementation(function capture(arg) {
		seen.push(arg);
	});
	try {
		// OCTANE DIVERGENCE[intersection-observer-unsupported-mount-error-surface][runtime:c0bb0181b9e6cedf]: Same effect-phase console.error surface as the options fallback case.
		await act(function remountUnsupportedDefault() {
			rerender(<HookComponent key="undefined" />);
		});
		expect(String(seen[0])).toMatch(/IntersectionObserver is not a constructor/);
	} finally {
		spy.mockRestore();
	}
});

// Per upstream/src/__tests__/useInView.test.tsx:403.
test('should restore the browser IntersectionObserver', () => {
	expect(vi.isMockFunction(window.IntersectionObserver)).toBe(true);
	destroyIntersectionMocking();

	// This should restore the original IntersectionObserver
	expect(window.IntersectionObserver).toBeDefined();
	expect(vi.isMockFunction(window.IntersectionObserver)).toBe(false);
});

// Per upstream/src/__tests__/useInView.test.tsx:412.
test('should trigger all hooks when using triggerOnce with merged refs', () => {
	const MultipleHooksWithTriggerOnce = () => {
		const [ref1, inView1] = useInView({ triggerOnce: true });
		const [ref2, inView2] = useInView({ triggerOnce: true });
		const [ref3, inView3] = useInView({ triggerOnce: true });

		const setRefs = useCallback(
			(node: Element | null) => {
				ref1(node);
				ref2(node);
				ref3(node);
			},
			[ref1, ref2, ref3],
		);

		return (
			<div ref={setRefs}>
				<div data-testid="item-1" data-inview={inView1.toString()}>
					{inView1.toString()}
				</div>
				<div data-testid="item-2" data-inview={inView2.toString()}>
					{inView2.toString()}
				</div>
				<div data-testid="item-3" data-inview={inView3.toString()}>
					{inView3.toString()}
				</div>
			</div>
		);
	};

	const { getByTestId } = render(<MultipleHooksWithTriggerOnce />);

	mockAllIsIntersecting(true);

	expect(getByTestId('item-1').getAttribute('data-inview')).toBe('true');
	expect(getByTestId('item-2').getAttribute('data-inview')).toBe('true');
	expect(getByTestId('item-3').getAttribute('data-inview')).toBe('true');
});
