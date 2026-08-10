import Draggable, {
	DraggableCore,
	type DraggableCoreProps,
	type DraggableProps,
} from '@octanejs/react-draggable';
import { createElement, createRoot, flushSync } from 'octane';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushEffects } from '../../../octane/tests/_helpers.ts';
import { CoreHarness } from '../runtime/_fixtures/CoreHarness.tsrx';
import {
	BareDraggableHarness,
	DraggableHarness,
	SvgDraggableHarness,
} from '../runtime/_fixtures/DraggableHarness.tsrx';

type Mounted = ReturnType<typeof mountDraggable>;

afterEach(() => {
	vi.restoreAllMocks();
	document.body.innerHTML = '';
	document.body.className = '';
	document.querySelector('#react-draggable-style-el')?.remove();
});

function adaptedCase(identity: string, run: () => void | Promise<void>): void {
	it(identity.slice(identity.indexOf('::') + 2), run);
}

function mountDraggable(props: Record<string, unknown> = {}) {
	const container = document.createElement('div');
	document.body.appendChild(container);
	const root = createRoot(container);
	const nodeRef = { current: null as HTMLDivElement | null };
	root.render(DraggableHarness, { nodeRef, enableUserSelectHack: false, ...props });
	flushSync(() => {});
	flushEffects();
	return { container, root, nodeRef, node: nodeRef.current! };
}

function mountCore(props: Record<string, unknown> = {}) {
	const container = document.createElement('div');
	document.body.appendChild(container);
	const root = createRoot(container);
	const nodeRef = { current: null as HTMLDivElement | null };
	const callbacks = { onStart: vi.fn(), onDrag: vi.fn(), onStop: vi.fn(), onMouseDown: vi.fn() };
	root.render(CoreHarness, { nodeRef, enableUserSelectHack: false, ...callbacks, ...props });
	flushSync(() => {});
	flushEffects();
	return { container, root, nodeRef, node: nodeRef.current!, ...callbacks };
}

function mouse(node: EventTarget, type: string, init: MouseEventInit = {}): void {
	node.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, ...init }));
	flushSync(() => {});
}

function drag(mounted: Mounted, x: number, y: number): void {
	mouse(mounted.node, 'mousedown');
	mouse(document, 'mousemove', { clientX: x, clientY: y });
}

function touchEvent(
	type: string,
	targetTouches: Array<{ identifier: number; clientX: number; clientY: number }>,
	changedTouches = targetTouches,
): TouchEvent {
	const event = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent;
	Object.defineProperties(event, {
		targetTouches: { value: targetTouches },
		changedTouches: { value: changedTouches },
	});
	return event;
}

describe('pinned Draggable public cases', () => {
	adaptedCase('tag/test/Draggable.test.jsx::should have sensible defaults', () => {
		expect(Draggable.defaultProps).toMatchObject({
			axis: 'both',
			bounds: false,
			defaultClassName: 'react-draggable',
			defaultClassNameDragging: 'react-draggable-dragging',
			defaultClassNameDragged: 'react-draggable-dragged',
			scale: 1,
		});
	});
	adaptedCase('tag/test/Draggable.test.jsx::should render with default class', () => {
		const mounted = mountDraggable();
		expect(mounted.node.classList.contains('react-draggable')).toBe(true);
	});
	adaptedCase('tag/test/Draggable.test.jsx::should preserve child className', () => {
		const mounted = mountDraggable();
		expect(mounted.node.classList.contains('child')).toBe(true);
	});
	adaptedCase('tag/test/Draggable.test.jsx::should preserve child styles', () => {
		const mounted = mountDraggable();
		expect(mounted.node.style.color).toBe('red');
	});
	adaptedCase('tag/test/Draggable.test.jsx::should apply transform style', () => {
		const mounted = mountDraggable();
		expect(mounted.node.style.transform).toBe('translate(0px,0px)');
	});
	adaptedCase('tag/test/Draggable.test.jsx::should use custom defaultClassName', () => {
		const mounted = mountDraggable({ defaultClassName: 'custom-draggable' });
		expect(mounted.node.classList.contains('custom-draggable')).toBe(true);
	});
	adaptedCase('tag/test/Draggable.test.jsx::should add dragging class during drag', () => {
		const mounted = mountDraggable();
		expect(mounted.node.classList.contains('react-draggable-dragging')).toBe(false);
		mouse(mounted.node, 'mousedown');
		expect(mounted.node.classList.contains('react-draggable-dragging')).toBe(true);
		mouse(document, 'mouseup');
		expect(mounted.node.classList.contains('react-draggable-dragging')).toBe(false);
	});
	adaptedCase('tag/test/Draggable.test.jsx::should add dragged class after drag', () => {
		const mounted = mountDraggable();
		drag(mounted, 2, 3);
		mouse(document, 'mouseup', { clientX: 2, clientY: 3 });
		expect(mounted.node.classList.contains('react-draggable-dragged')).toBe(true);
	});
	adaptedCase('tag/test/Draggable.test.jsx::should use custom class names', () => {
		const mounted = mountDraggable({
			defaultClassName: 'base',
			defaultClassNameDragging: 'moving',
			defaultClassNameDragged: 'moved',
		});
		mouse(mounted.node, 'mousedown');
		expect(mounted.node.classList.contains('moving')).toBe(true);
		mouse(document, 'mouseup');
		expect(mounted.node.classList.contains('moved')).toBe(true);
	});
	adaptedCase('tag/test/Draggable.test.jsx::should respect defaultPosition', () => {
		const mounted = mountDraggable({ defaultPosition: { x: 7, y: 8 } });
		expect(mounted.node.style.transform).toBe('translate(7px,8px)');
	});
	adaptedCase('tag/test/Draggable.test.jsx::should use controlled position', () => {
		const mounted = mountDraggable({ position: { x: 9, y: 10 }, onStop: vi.fn() });
		expect(mounted.node.style.transform).toBe('translate(9px,10px)');
	});
	adaptedCase('tag/test/Draggable.test.jsx::should respect positionOffset with numbers', () => {
		const mounted = mountDraggable({ positionOffset: { x: 5, y: 6 } });
		expect(mounted.node.style.transform).toBe('translate(5px, 6px)translate(0px,0px)');
	});
	adaptedCase('tag/test/Draggable.test.jsx::should respect positionOffset with percentages', () => {
		const mounted = mountDraggable({ positionOffset: { x: '10%', y: '20%' } });
		expect(mounted.node.style.transform).toBe('translate(10%, 20%)translate(0px,0px)');
	});
	adaptedCase('tag/test/Draggable.test.jsx::should not move when axis="none"', () => {
		const mounted = mountDraggable({ axis: 'none' });
		drag(mounted, 10, 12);
		expect(mounted.node.style.transform).toBe('translate(0px,0px)');
	});
	adaptedCase('tag/test/Draggable.test.jsx::should call onStart when drag starts', () => {
		const onStart = vi.fn();
		const mounted = mountDraggable({ onStart });
		mouse(mounted.node, 'mousedown');
		expect(onStart).toHaveBeenCalledTimes(1);
	});
	adaptedCase('tag/test/Draggable.test.jsx::should cancel drag when onStart returns false', () => {
		const onDrag = vi.fn();
		const mounted = mountDraggable({ onStart: () => false, onDrag });
		drag(mounted, 4, 5);
		expect(onDrag).not.toHaveBeenCalled();
	});
	adaptedCase('tag/test/Draggable.test.jsx::should detect SVG elements', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		const nodeRef = { current: null as SVGSVGElement | null };
		root.render(SvgDraggableHarness, { nodeRef, defaultPosition: { x: 1, y: 2 } });
		flushSync(() => {});
		flushEffects();
		flushSync(() => {});
		expect(nodeRef.current?.getAttribute('transform')).toBe('translate(1,2)');
	});
	adaptedCase(
		'tag/test/Draggable.test.jsx::should not set isElementSVG for non-SVG elements',
		() => {
			const mounted = mountDraggable({ defaultPosition: { x: 1, y: 2 } });
			expect(mounted.node.getAttribute('transform')).toBeNull();
		},
	);
	adaptedCase('tag/test/Draggable.test.jsx::should set initial transform attribute for SVG', () => {
		const container = document.createElement('div');
		const root = createRoot(container);
		const nodeRef = { current: null as SVGSVGElement | null };
		root.render(SvgDraggableHarness, { nodeRef, defaultPosition: { x: 3, y: 4 } });
		flushSync(() => {});
		flushEffects();
		flushSync(() => {});
		expect(nodeRef.current?.getAttribute('transform')).toBe('translate(3,4)');
	});
	adaptedCase('tag/test/Draggable.test.jsx::should respect position prop changes', () => {
		const mounted = mountDraggable({ position: { x: 1, y: 2 }, onStop: vi.fn() });
		mounted.root.render(DraggableHarness, {
			nodeRef: mounted.nodeRef,
			enableUserSelectHack: false,
			position: { x: 20, y: 30 },
			onStop: vi.fn(),
		});
		flushSync(() => {});
		expect(mounted.node.style.transform).toBe('translate(20px,30px)');
	});
	adaptedCase(
		'tag/test/Draggable.test.jsx::should revert to controlled position after drag',
		() => {
			const mounted = mountDraggable({ position: { x: 2, y: 3 }, onStop: vi.fn() });
			drag(mounted, 5, 6);
			mouse(document, 'mouseup', { clientX: 5, clientY: 6 });
			expect(mounted.node.style.transform).toBe('translate(2px,3px)');
		},
	);
	adaptedCase('tag/test/Draggable.test.jsx::should not drag when disabled', () => {
		const onDrag = vi.fn();
		const mounted = mountDraggable({ disabled: true, onDrag });
		drag(mounted, 5, 6);
		expect(onDrag).not.toHaveBeenCalled();
	});
	adaptedCase('tag/test/Draggable.test.jsx::should throw when no children provided', () => {
		const root = createRoot(document.createElement('div'));
		expect(() => {
			root.render(Draggable as unknown as (props: DraggableProps) => unknown, {});
			flushSync(() => {});
		}).toThrow();
	});
	adaptedCase('tag/test/Draggable.test.jsx::should throw when multiple children provided', () => {
		const root = createRoot(document.createElement('div'));
		expect(() => {
			root.render(Draggable as unknown as (props: DraggableProps) => unknown, {
				children: [createElement('div', {}), createElement('div', {})],
			});
			flushSync(() => {});
		}).toThrow();
	});
	adaptedCase(
		'tag/test/Draggable.test.jsx::should still render when className is set on Draggable',
		() => {
			expect(mountDraggable({ className: 'ignored' }).node.dataset.kept).toBe('yes');
		},
	);
	adaptedCase(
		'tag/test/Draggable.test.jsx::should still render when style is set on Draggable',
		() => {
			expect(mountDraggable({ style: { color: 'blue' } }).node.dataset.kept).toBe('yes');
		},
	);
	adaptedCase(
		'tag/test/Draggable.test.jsx::should still render when transform is set on Draggable',
		() => {
			expect(mountDraggable({ transform: 'scale(2)' }).node.dataset.kept).toBe('yes');
		},
	);
});

describe('pinned DraggableCore public cases', () => {
	adaptedCase('tag/test/DraggableCore.test.jsx::should render its child', () => {
		expect(mountCore().node.id).toBe('core-target');
	});
	adaptedCase('tag/test/DraggableCore.test.jsx::should accept a single child only', () => {
		const mounted = mountCore();
		expect(mounted.container.children).toHaveLength(1);
	});
	adaptedCase('tag/test/DraggableCore.test.jsx::should call onStart when mouse down', () => {
		const mounted = mountCore();
		mouse(mounted.node, 'mousedown');
		expect(mounted.onStart).toHaveBeenCalledTimes(1);
	});
	adaptedCase('tag/test/DraggableCore.test.jsx::should call onDrag during mouse move', () => {
		const mounted = mountCore();
		mouse(mounted.node, 'mousedown');
		mouse(document, 'mousemove', { clientX: 3, clientY: 4 });
		expect(mounted.onDrag).toHaveBeenCalledTimes(1);
	});
	adaptedCase('tag/test/DraggableCore.test.jsx::should call onStop when mouse up', () => {
		const mounted = mountCore();
		mouse(mounted.node, 'mousedown');
		mouse(document, 'mouseup');
		expect(mounted.onStop).toHaveBeenCalledTimes(1);
	});
	adaptedCase('tag/test/DraggableCore.test.jsx::should provide correct data in callbacks', () => {
		const mounted = mountCore();
		mouse(mounted.node, 'mousedown', { clientX: 2, clientY: 3 });
		mouse(document, 'mousemove', { clientX: 7, clientY: 9 });
		expect(mounted.onDrag.mock.calls[0][1]).toMatchObject({
			x: 7,
			y: 9,
			deltaX: 5,
			deltaY: 6,
			lastX: 2,
			lastY: 3,
			node: mounted.node,
		});
	});
	adaptedCase('tag/test/DraggableCore.test.jsx::should not start dragging when disabled', () => {
		const mounted = mountCore({ disabled: true });
		mouse(mounted.node, 'mousedown');
		expect(mounted.onStart).not.toHaveBeenCalled();
	});
	adaptedCase(
		'tag/test/DraggableCore.test.jsx::should cancel drag when onStart returns false',
		() => {
			const onDrag = vi.fn();
			const mounted = mountCore({ onStart: () => false, onDrag });
			mouse(mounted.node, 'mousedown');
			mouse(document, 'mousemove', { clientX: 2, clientY: 2 });
			expect(onDrag).not.toHaveBeenCalled();
		},
	);
	adaptedCase('tag/test/DraggableCore.test.jsx::should stop drag when onDrag returns false', () => {
		const onStop = vi.fn();
		const mounted = mountCore({ onDrag: () => false, onStop });
		mouse(mounted.node, 'mousedown');
		mouse(document, 'mousemove', { clientX: 2, clientY: 2 });
		expect(onStop).toHaveBeenCalledTimes(1);
	});
	adaptedCase('tag/test/DraggableCore.test.jsx::should only drag from handle', () => {
		const mounted = mountCore({ handle: '.handle' });
		mouse(mounted.node.querySelector('#plain')!, 'mousedown');
		expect(mounted.onStart).not.toHaveBeenCalled();
	});
	adaptedCase('tag/test/DraggableCore.test.jsx::should work with nested elements in handle', () => {
		const mounted = mountCore({ handle: '.handle' });
		mouse(mounted.node.querySelector('#deep-handle')!, 'mousedown');
		expect(mounted.onStart).toHaveBeenCalledTimes(1);
	});
	adaptedCase('tag/test/DraggableCore.test.jsx::should not drag from cancel elements', () => {
		const mounted = mountCore({ cancel: '.cancel' });
		mouse(mounted.node.querySelector('#deep-cancel')!, 'mousedown');
		expect(mounted.onStart).not.toHaveBeenCalled();
	});
	adaptedCase('tag/test/DraggableCore.test.jsx::should snap movement to grid', () => {
		const mounted = mountCore({ grid: [10, 10] });
		mouse(mounted.node, 'mousedown');
		mouse(document, 'mousemove', { clientX: 14, clientY: 14 });
		expect(mounted.onDrag.mock.calls[0][1]).toMatchObject({ x: 10, y: 10 });
	});
	adaptedCase(
		'tag/test/DraggableCore.test.jsx::should not call onDrag if movement is less than grid',
		() => {
			const mounted = mountCore({ grid: [10, 10] });
			mouse(mounted.node, 'mousedown');
			mouse(document, 'mousemove', { clientX: 4, clientY: 4 });
			expect(mounted.onDrag).not.toHaveBeenCalled();
		},
	);
	adaptedCase('tag/test/DraggableCore.test.jsx::should adjust position based on scale', () => {
		const mounted = mountCore({ scale: 2 });
		mouse(mounted.node, 'mousedown');
		mouse(document, 'mousemove', { clientX: 10, clientY: 12 });
		expect(mounted.onDrag.mock.calls[0][1]).toMatchObject({ x: 5, y: 6 });
	});
	adaptedCase('tag/test/DraggableCore.test.jsx::should work with scale < 1', () => {
		const mounted = mountCore({ scale: 0.5 });
		mouse(mounted.node, 'mousedown');
		mouse(document, 'mousemove', { clientX: 5, clientY: 6 });
		expect(mounted.onDrag.mock.calls[0][1]).toMatchObject({ x: 10, y: 12 });
	});
	adaptedCase(
		'tag/test/DraggableCore.test.jsx::should only respond to left click by default',
		() => {
			const mounted = mountCore();
			mouse(mounted.node, 'mousedown', { button: 2 });
			expect(mounted.onStart).not.toHaveBeenCalled();
		},
	);
	adaptedCase(
		'tag/test/DraggableCore.test.jsx::should respond to any click when allowAnyClick is true',
		() => {
			const mounted = mountCore({ allowAnyClick: true });
			mouse(mounted.node, 'mousedown', { button: 2 });
			expect(mounted.onStart).toHaveBeenCalledTimes(1);
		},
	);
	adaptedCase('tag/test/DraggableCore.test.jsx::should use nodeRef instead of findDOMNode', () => {
		const mounted = mountCore();
		mouse(mounted.node, 'mousedown');
		expect(mounted.onStart.mock.calls[0][1].node).toBe(mounted.nodeRef.current);
	});
	// Octane has no forwardRef; adapt to the React-19/Octane ref-as-prop boundary
	// through a custom child that forwards handlers and the shared nodeRef.
	adaptedCase('tag/test/DraggableCore.test.jsx::should work with forwardRef components', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		const nodeRef = { current: null as HTMLDivElement | null };
		const onDrag = vi.fn();
		function CustomChild(props: {
			ref?: { current: HTMLDivElement | null };
			'data-testid'?: string;
			children?: string;
			onMouseDown?: (event: MouseEvent) => void;
			onMouseUp?: (event: MouseEvent) => void;
			onTouchEnd?: (event: TouchEvent) => void;
		}) {
			return createElement(
				'div',
				{
					ref: props.ref,
					'data-testid': props['data-testid'],
					onMouseDown: props.onMouseDown,
					onMouseUp: props.onMouseUp,
					onTouchEnd: props.onTouchEnd,
				},
				props.children ?? 'Custom',
			);
		}
		root.render(
			createElement(DraggableCore, {
				nodeRef,
				onDrag,
				enableUserSelectHack: false,
				children: createElement(CustomChild, {
					ref: nodeRef,
					'data-testid': 'target',
					children: 'Custom',
				}),
			}),
		);
		flushSync(() => {});
		flushEffects();
		const target = container.querySelector('[data-testid="target"]') as HTMLDivElement;
		expect(nodeRef.current).toBe(target);
		mouse(target, 'mousedown', { clientX: 0, clientY: 0 });
		mouse(document, 'mousemove', { clientX: 5, clientY: 6 });
		expect(onDrag).toHaveBeenCalled();
		expect(onDrag.mock.calls[0][1].node.textContent).toBe('Custom');
		root.unmount();
		container.remove();
	});
	adaptedCase('tag/test/DraggableCore.test.jsx::should handle touch start', () => {
		const mounted = mountCore();
		mounted.node.dispatchEvent(
			touchEvent('touchstart', [{ identifier: 1, clientX: 1, clientY: 2 }]),
		);
		expect(mounted.onStart).toHaveBeenCalledTimes(1);
	});
	adaptedCase(
		'tag/test/DraggableCore.test.jsx::should call preventDefault on touchstart by default',
		() => {
			const mounted = mountCore();
			const event = touchEvent('touchstart', [{ identifier: 1, clientX: 1, clientY: 2 }]);
			mounted.node.dispatchEvent(event);
			expect(event.defaultPrevented).toBe(true);
		},
	);
	adaptedCase(
		'tag/test/DraggableCore.test.jsx::should not call preventDefault when allowMobileScroll is true',
		() => {
			const mounted = mountCore({ allowMobileScroll: true });
			const event = touchEvent('touchstart', [{ identifier: 1, clientX: 1, clientY: 2 }]);
			mounted.node.dispatchEvent(event);
			expect(event.defaultPrevented).toBe(false);
		},
	);
	adaptedCase('tag/test/DraggableCore.test.jsx::should call onMouseDown callback', () => {
		const mounted = mountCore();
		mouse(mounted.node, 'mousedown');
		expect(mounted.onMouseDown).toHaveBeenCalledTimes(1);
	});
	adaptedCase('tag/test/DraggableCore.test.jsx::should call onMouseDown even when disabled', () => {
		const mounted = mountCore({ disabled: true });
		mouse(mounted.node, 'mousedown');
		expect(mounted.onMouseDown).toHaveBeenCalledTimes(1);
	});
	adaptedCase(
		'tag/test/DraggableCore.test.jsx::should add transparent selection class by default',
		() => {
			const mounted = mountCore({ enableUserSelectHack: true });
			mouse(mounted.node, 'mousedown');
			expect(document.body.classList.contains('react-draggable-transparent-selection')).toBe(true);
		},
	);
	adaptedCase(
		'tag/test/DraggableCore.test.jsx::should not add class when enableUserSelectHack is false',
		() => {
			const mounted = mountCore({ enableUserSelectHack: false });
			mouse(mounted.node, 'mousedown');
			expect(document.body.classList.contains('react-draggable-transparent-selection')).toBe(false);
		},
	);
	adaptedCase(
		'tag/test/DraggableCore.test.jsx::should not add user-select class when onStart returns false',
		() => {
			const mounted = mountCore({ enableUserSelectHack: true, onStart: () => false });
			mouse(mounted.node, 'mousedown');
			expect(document.body.classList.contains('react-draggable-transparent-selection')).toBe(false);
		},
	);
	adaptedCase(
		'tag/test/DraggableCore.test.jsx::applies the nonce to the injected style element on drag start',
		() => {
			document.querySelector('#react-draggable-style-el')?.remove();
			const mounted = mountCore({ enableUserSelectHack: true, nonce: 'pinned-nonce' });
			mouse(mounted.node, 'mousedown');
			expect(document.querySelector('#react-draggable-style-el')?.getAttribute('nonce')).toBe(
				'pinned-nonce',
			);
		},
	);
	// Upstream reads class-instance `.mounted`; Octane keeps that guard private.
	// Assert the consumer-visible cleanup: an active drag must not continue after unmount.
	adaptedCase('tag/test/DraggableCore.test.jsx::should track mounted state correctly', () => {
		const mounted = mountCore();
		mouse(mounted.node, 'mousedown');
		expect(mounted.onStart).toHaveBeenCalledTimes(1);
		mounted.root.unmount();
		mouse(document, 'mousemove', { clientX: 10, clientY: 12 });
		mouse(document, 'mouseup', { clientX: 10, clientY: 12 });
		expect(mounted.onDrag).not.toHaveBeenCalled();
		expect(mounted.onStop).not.toHaveBeenCalled();
	});
	adaptedCase(
		'tag/test/DraggableCore.test.jsx::should not continue drag if onStart returns false',
		() => {
			const mounted = mountCore({ onStart: () => false });
			mouse(mounted.node, 'mousedown');
			mouse(document, 'mousemove', { clientX: 2, clientY: 3 });
			expect(mounted.onDrag).not.toHaveBeenCalled();
		},
	);
	adaptedCase(
		'tag/test/DraggableCore.test.jsx::should call preventDefault on touchstart when using handle',
		() => {
			const mounted = mountCore({ handle: '.handle' });
			const event = touchEvent('touchstart', [{ identifier: 1, clientX: 1, clientY: 2 }]);
			mounted.node.querySelector('#deep-handle')!.dispatchEvent(event);
			expect(event.defaultPrevented).toBe(true);
		},
	);
	adaptedCase(
		'tag/test/DraggableCore.test.jsx::should not call preventDefault on touchstart for cancel elements',
		() => {
			const mounted = mountCore({ cancel: '.cancel' });
			const event = touchEvent('touchstart', [{ identifier: 1, clientX: 1, clientY: 2 }]);
			mounted.node.querySelector('#deep-cancel')!.dispatchEvent(event);
			expect(event.defaultPrevented).toBe(false);
		},
	);
	adaptedCase(
		'tag/test/DraggableCore.test.jsx::should throw error when no children provided',
		() => {
			const root = createRoot(document.createElement('div'));
			expect(() => {
				root.render(DraggableCore as unknown as (props: DraggableCoreProps) => unknown, {});
				flushSync(() => {});
			}).toThrow();
		},
	);
});
