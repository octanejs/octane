import { createRoot, flushSync } from 'octane';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushEffects } from '../../../octane/tests/_helpers.ts';
import Draggable, { DraggableCore } from '@octanejs/draggable';
import {
	BareDraggableHarness,
	ChildRefDraggableHarness,
	DraggableHarness,
	SvgDraggableHarness,
} from './_fixtures/DraggableHarness.tsrx';

afterEach(() => {
	vi.restoreAllMocks();
	document.body.innerHTML = '';
});

function mount(props: Record<string, unknown> = {}) {
	const container = document.createElement('div');
	document.body.appendChild(container);
	const root = createRoot(container);
	const nodeRef = { current: null as HTMLDivElement | null };
	root.render(DraggableHarness, { nodeRef, enableUserSelectHack: false, ...props });
	flushSync(() => {});
	flushEffects();
	return { root, container, nodeRef, node: nodeRef.current! };
}

function drag(node: Element, points: Array<[number, number]>): void {
	node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
	for (const [clientX, clientY] of points) {
		document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX, clientY }));
		flushSync(() => {});
	}
}

describe('Draggable visual contract', () => {
	// Adapted from pinned upstream tag test/Draggable.test.jsx rendering,
	// controlled-position, bounds, grid, class, and handler-replacement cases.
	// @parity-case adapted:draggable-rendering
	it('exports the pinned root values and clones one child without a wrapper', () => {
		expect(Draggable.displayName).toBe('Draggable');
		expect(typeof DraggableCore).toBe('function');
		expect(Draggable.defaultProps).toMatchObject({
			allowAnyClick: false,
			allowMobileScroll: false,
			disabled: false,
			enableUserSelectHack: true,
			scale: 1,
		});
		for (const callback of ['onStart', 'onDrag', 'onStop', 'onMouseDown'] as const) {
			expect(typeof Draggable.defaultProps[callback]).toBe('function');
		}
		const mounted = mount({ defaultPosition: { x: 10, y: 20 } });
		expect(mounted.container.children).toHaveLength(1);
		expect(mounted.node.dataset.kept).toBe('yes');
		expect(mounted.node.className).toBe('child react-draggable');
		expect(mounted.node.style.color).toBe('red');
		expect(mounted.node.style.transform).toBe('translate(10px,20px)');
		mounted.root.unmount();
	});

	// @parity-case adapted:draggable-uncontrolled-axis-classes
	it('moves uncontrolled, emits data, applies axis, and retains dragged class', () => {
		const onDrag = vi.fn();
		const mounted = mount({ axis: 'x', onDrag });
		mounted.node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 12, clientY: 8 }));
		flushSync(() => {});
		expect(onDrag.mock.calls[0][1]).toMatchObject({ x: 12, y: 8, deltaX: 12, deltaY: 8 });
		expect(mounted.node.style.transform).toBe('translate(12px,0px)');
		document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 12, clientY: 8 }));
		flushSync(() => {});
		expect(mounted.node.classList.contains('react-draggable-dragged')).toBe(true);
		mounted.root.unmount();
	});

	// @parity-case adapted:draggable-scale-once
	it('applies scale exactly once across Draggable and DraggableCore', () => {
		const onDrag = vi.fn();
		const mounted = mount({ scale: 2, onDrag });
		mounted.node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 20 }));
		flushSync(() => {});
		expect(onDrag.mock.calls[0][1]).toMatchObject({ x: 10, deltaX: 10 });
		expect(mounted.node.style.transform).toBe('translate(10px,0px)');
		mounted.root.unmount();
	});

	// @parity-case adapted:draggable-controlled-position
	it('reverts a controlled gesture on stop', () => {
		const mounted = mount({ position: { x: 3, y: 4 }, onStop: vi.fn() });
		mounted.node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		document.dispatchEvent(
			new MouseEvent('mousemove', { bubbles: true, clientX: 10, clientY: 10 }),
		);
		flushSync(() => {});
		expect(mounted.node.style.transform).toBe('translate(13px,14px)');
		document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 10, clientY: 10 }));
		flushSync(() => {});
		expect(mounted.node.style.transform).toBe('translate(3px,4px)');
		mounted.root.unmount();
	});

	// @parity-case adapted:draggable-controlled-prop-update
	it('applies controlled position prop updates on an existing mount', () => {
		const mounted = mount({ position: { x: 3, y: 4 }, onStop: vi.fn() });
		expect(mounted.node.style.transform).toBe('translate(3px,4px)');
		mounted.root.render(DraggableHarness, {
			nodeRef: mounted.nodeRef,
			enableUserSelectHack: false,
			position: { x: 100, y: 100 },
			onStop: vi.fn(),
		});
		flushSync(() => {});
		flushEffects();
		expect(mounted.node.style.transform).toBe('translate(100px,100px)');
		mounted.root.unmount();
	});

	// @parity-case adapted:draggable-missing-node-ref
	it('matches the React 19 missing-nodeRef mouse and touch boundary', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		root.render(BareDraggableHarness, { enableUserSelectHack: false });
		flushSync(() => {});
		flushEffects();
		const node = container.querySelector('.bare')!;
		const errors: Error[] = [];
		const onError = (event: ErrorEvent) => {
			errors.push(event.error);
			event.preventDefault();
		};
		window.addEventListener('error', onError);
		node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
		window.removeEventListener('error', onError);
		expect(errors[0]?.message).toBe('<DraggableCore> not mounted on DragStart!');
		expect(() =>
			node.dispatchEvent(new Event('touchstart', { bubbles: true, cancelable: true })),
		).not.toThrow();
		root.unmount();
	});

	// @parity-case adapted:draggable-offset-handlers
	it('applies numeric/string position offsets and replaces child drag handlers', () => {
		const childMouseDown = vi.fn(),
			onMouseDown = vi.fn();
		const mounted = mount({
			defaultPosition: { x: 3, y: 4 },
			positionOffset: { x: 10, y: '25%' },
			childMouseDown,
			onMouseDown,
		});
		expect(mounted.node.style.transform).toBe('translate(10px, 25%)translate(3px,4px)');
		mounted.node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		expect(onMouseDown).toHaveBeenCalledTimes(1);
		expect(childMouseDown).not.toHaveBeenCalled();
		mounted.root.unmount();
	});

	// @parity-case adapted:draggable-grid
	it('snaps visual and callback coordinates to the configured grid', () => {
		const onDrag = vi.fn();
		const mounted = mount({ grid: [10, 5], onDrag });
		drag(mounted.node, [[14, 8]]);
		expect(onDrag.mock.calls[0][1]).toMatchObject({ x: 10, y: 10, deltaX: 10, deltaY: 10 });
		expect(mounted.node.style.transform).toBe('translate(10px,10px)');
		mounted.root.unmount();
	});

	// @parity-case adapted:draggable-bounds
	it('clips object bounds and consumes slack before moving back inside', () => {
		const onDrag = vi.fn();
		const mounted = mount({ bounds: { right: 10 }, onDrag });
		drag(mounted.node, [
			[20, 0],
			[15, 0],
			[10, 0],
			[5, 0],
		]);
		expect(onDrag.mock.calls.map((call) => call[1].x)).toEqual([10, 10, 10, 5]);
		expect(mounted.node.style.transform).toBe('translate(5px,0px)');
		mounted.root.unmount();
	});

	// @parity-case adapted:draggable-svg
	it('switches mounted SVG children to the transform attribute', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		const nodeRef = { current: null as SVGSVGElement | null };
		root.render(SvgDraggableHarness, { nodeRef, defaultPosition: { x: 6, y: 7 } });
		flushSync(() => {});
		flushEffects();
		flushSync(() => {});
		expect(nodeRef.current?.getAttribute('transform')).toBe('translate(6,7)');
		expect(nodeRef.current?.style.transform).toBe('');
		expect(nodeRef.current?.style.fill).toBe('red');
		root.unmount();
		container.remove();
	});

	// @parity-case adapted:draggable-child-ref-forms
	it('forwards array child refs and callback-ref cleanups through the clone', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		const nodeRef = { current: null as HTMLDivElement | null };
		const objectRef = { current: null as HTMLDivElement | null };
		const seen: Array<HTMLDivElement | null> = [];
		const cleanups: string[] = [];
		function callbackRef(value: HTMLDivElement | null) {
			seen.push(value);
			if (value) {
				return function cleanup() {
					cleanups.push('cleanup');
				};
			}
		}
		root.render(ChildRefDraggableHarness, {
			nodeRef,
			childRef: [objectRef, callbackRef],
			enableUserSelectHack: false,
		});
		flushSync(() => {});
		flushEffects();
		expect(nodeRef.current).toBeInstanceOf(HTMLDivElement);
		expect(objectRef.current).toBe(nodeRef.current);
		expect(seen).toEqual([nodeRef.current]);
		const attached = nodeRef.current;
		root.unmount();
		expect(objectRef.current).toBeNull();
		// React-19 cleanup path runs the returned cleanup instead of ref(null).
		expect(seen).toEqual([attached]);
		expect(cleanups).toEqual(['cleanup']);
		container.remove();
	});

	// @parity-case adapted:draggable-noderef-swap
	it('retargets nodeRef.current when the nodeRef identity changes', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		const firstRef = { current: null as HTMLDivElement | null };
		const secondRef = { current: null as HTMLDivElement | null };
		root.render(DraggableHarness, { nodeRef: firstRef, enableUserSelectHack: false });
		flushSync(() => {});
		flushEffects();
		const node = firstRef.current;
		expect(node).toBeInstanceOf(HTMLDivElement);
		root.render(DraggableHarness, { nodeRef: secondRef, enableUserSelectHack: false });
		flushSync(() => {});
		flushEffects();
		expect(firstRef.current).toBeNull();
		expect(secondRef.current).toBe(node);
		root.unmount();
		container.remove();
	});

	// @parity-case adapted:draggable-stable-child-ref
	it('does not churn child callback-ref cleanups across drag re-renders', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		const nodeRef = { current: null as HTMLDivElement | null };
		const cleanups: string[] = [];
		function callbackRef(value: HTMLDivElement | null) {
			if (value) {
				return function cleanup() {
					cleanups.push('cleanup');
				};
			}
		}
		root.render(ChildRefDraggableHarness, {
			nodeRef,
			childRef: callbackRef,
			enableUserSelectHack: false,
		});
		flushSync(() => {});
		flushEffects();
		drag(nodeRef.current!, [
			[10, 0],
			[20, 0],
			[30, 0],
		]);
		expect(cleanups).toEqual([]);
		root.unmount();
		expect(cleanups).toEqual(['cleanup']);
		container.remove();
	});
});
