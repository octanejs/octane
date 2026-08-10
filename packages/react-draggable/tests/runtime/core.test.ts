import { createRoot, flushSync } from 'octane';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushEffects } from '../../../octane/tests/_helpers.ts';
import { CoreHarness } from './_fixtures/CoreHarness.tsrx';
import { StandardChildrenHarness } from './_fixtures/StandardChildrenHarness.tsrx';

afterEach(() => {
	vi.restoreAllMocks();
	document.body.innerHTML = '';
	document.body.className = '';
});

function renderCore(props: Record<string, unknown> = {}) {
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

describe('DraggableCore native callback-only contract', () => {
	// @parity-case adapted:core-callback-data
	it('emits exact core deltas and leaves child styles/classes untouched', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		const nodeRef = { current: null as HTMLDivElement | null };
		const onStart = vi.fn(),
			onDrag = vi.fn(),
			onStop = vi.fn();
		const add = vi.spyOn(document, 'addEventListener');
		root.render(CoreHarness, { nodeRef, onStart, onDrag, onStop });
		flushSync(() => {});
		flushEffects();
		const node = nodeRef.current!;
		node.dispatchEvent(
			new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 20, button: 0 }),
		);
		expect(add.mock.calls.map(([name]) => name)).toContain('mousemove');
		document.dispatchEvent(
			new MouseEvent('mousemove', { bubbles: true, clientX: 14, clientY: 27 }),
		);
		document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 15, clientY: 29 }));
		expect(onStart.mock.calls[0][1]).toMatchObject({
			node,
			x: 10,
			y: 20,
			deltaX: 0,
			deltaY: 0,
			lastX: 10,
			lastY: 20,
		});
		expect(onDrag.mock.calls[0][1]).toMatchObject({
			node,
			x: 14,
			y: 27,
			deltaX: 4,
			deltaY: 7,
			lastX: 10,
			lastY: 20,
		});
		expect(onStop.mock.calls[0][1]).toMatchObject({
			node,
			x: 15,
			y: 29,
			deltaX: 1,
			deltaY: 2,
			lastX: 14,
			lastY: 27,
		});
		expect(node.className).toBe('kept');
		expect(node.style.cssText).toContain('color: red');
		expect(node.style.transform).toBe('');
		root.unmount();
		container.remove();
	});
});

describe('start filtering and callback ordering', () => {
	// @parity-case adapted:core-click-filtering
	it.each([
		['right click', { button: 2 }],
		['macOS control click', { button: 0, ctrlKey: true }],
	] as const)('calls onMouseDown but rejects %s', (_label, init) => {
		const mounted = renderCore();
		mounted.node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, ...init }));
		expect(mounted.onMouseDown).toHaveBeenCalledTimes(1);
		expect(mounted.onStart).not.toHaveBeenCalled();
		mounted.root.unmount();
	});

	// @parity-case adapted:core-any-click-disabled
	it('supports allowAnyClick and keeps disabled after onMouseDown', () => {
		const allowed = renderCore({ allowAnyClick: true });
		allowed.node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2 }));
		expect(allowed.onStart).toHaveBeenCalledTimes(1);
		allowed.root.unmount();
		const disabled = renderCore({ disabled: true });
		disabled.node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		expect(disabled.onMouseDown).toHaveBeenCalledTimes(1);
		expect(disabled.onStart).not.toHaveBeenCalled();
		disabled.root.unmount();
	});

	// @parity-case adapted:core-handle-cancel
	it('walks handle and cancel selectors to the draggable root', () => {
		const handle = renderCore({ handle: '.handle' });
		handle.node
			.querySelector('#plain')!
			.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		expect(handle.onStart).not.toHaveBeenCalled();
		handle.node
			.querySelector('#deep-handle')!
			.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		expect(handle.onStart).toHaveBeenCalledTimes(1);
		handle.root.unmount();
		const cancel = renderCore({ cancel: '.cancel' });
		cancel.node
			.querySelector('#deep-cancel')!
			.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		expect(cancel.onStart).not.toHaveBeenCalled();
		cancel.root.unmount();
	});
});

describe('cancellation and native resource ownership', () => {
	// @parity-case adapted:core-cancel-start
	it('onStart=false installs no document listeners or selection artifact', () => {
		const add = vi.spyOn(document, 'addEventListener');
		const mounted = renderCore({ onStart: vi.fn(() => false), enableUserSelectHack: true });
		add.mockClear();
		mounted.node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		expect(add.mock.calls.some(([name]) => name === 'mousemove' || name === 'mouseup')).toBe(false);
		expect(document.body.classList.contains('react-draggable-transparent-selection')).toBe(false);
		mounted.root.unmount();
	});

	// @parity-case adapted:core-cancel-drag
	it('onDrag=false synthesizes mouse stop, while touch retains when identifier is absent', () => {
		const mouseStop = vi.fn();
		const mouse = renderCore({ onDrag: vi.fn(() => false), onStop: mouseStop });
		mouse.node.dispatchEvent(
			new MouseEvent('mousedown', { bubbles: true, clientX: 5, clientY: 5 }),
		);
		document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 8, clientY: 8 }));
		expect(mouseStop).toHaveBeenCalledTimes(1);
		expect(mouseStop.mock.calls[0][0].type).toBe('mouseup');
		mouse.root.unmount();

		const touchStop = vi.fn();
		const touch = renderCore({ onDrag: vi.fn(() => false), onStop: touchStop });
		touch.node.dispatchEvent(touchEvent('touchstart', [{ identifier: 7, clientX: 5, clientY: 5 }]));
		document.dispatchEvent(touchEvent('touchmove', [{ identifier: 7, clientX: 8, clientY: 8 }]));
		expect(touchStop).not.toHaveBeenCalled();
		document.dispatchEvent(touchEvent('touchend', [], [{ identifier: 7, clientX: 8, clientY: 8 }]));
		expect(touchStop).toHaveBeenCalledTimes(1);
		touch.root.unmount();
	});

	// @parity-case adapted:core-cancel-stop
	it('onStop=false retains the gesture until a later accepted stop', () => {
		const onStop = vi.fn().mockReturnValueOnce(false).mockReturnValue(undefined);
		const mounted = renderCore({ onStop });
		mounted.node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 2, clientY: 2 }));
		document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 3, clientY: 3 }));
		expect(mounted.onDrag).toHaveBeenCalledTimes(1);
		document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 3, clientY: 3 }));
		document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 4, clientY: 4 }));
		expect(mounted.onDrag).toHaveBeenCalledTimes(1);
		mounted.root.unmount();
	});
});

describe('touch and live props', () => {
	// @parity-case adapted:core-touch-lifecycle
	it('installs passive:false touchstart, prevents scroll, tracks initiating touch, and cleans up', () => {
		const add = vi.spyOn(HTMLElement.prototype, 'addEventListener');
		const remove = vi.spyOn(HTMLElement.prototype, 'removeEventListener');
		const mounted = renderCore();
		expect(
			add.mock.calls.some(
				([name, , options]) =>
					name === 'touchstart' && (options as AddEventListenerOptions).passive === false,
			),
		).toBe(true);
		const start = touchEvent('touchstart', [
			{ identifier: 4, clientX: 10, clientY: 20 },
			{ identifier: 9, clientX: 50, clientY: 60 },
		]);
		mounted.node.dispatchEvent(start);
		expect(start.defaultPrevented).toBe(true);
		document.dispatchEvent(
			touchEvent('touchmove', [
				{ identifier: 9, clientX: 70, clientY: 80 },
				{ identifier: 4, clientX: 13, clientY: 24 },
			]),
		);
		expect(mounted.onDrag.mock.calls[0][1]).toMatchObject({ x: 13, y: 24, deltaX: 3, deltaY: 4 });
		mounted.root.unmount();
		expect(
			remove.mock.calls.some(
				([name, , options]) =>
					name === 'touchstart' && (options as AddEventListenerOptions).passive === false,
			),
		).toBe(true);
	});

	// @parity-case adapted:core-live-props
	it('allowMobileScroll and live disabled/callback/grid/scale props are observed', () => {
		const mounted = renderCore({ allowMobileScroll: true });
		const start = touchEvent('touchstart', [{ identifier: 1, clientX: 0, clientY: 0 }]);
		mounted.node.dispatchEvent(start);
		expect(start.defaultPrevented).toBe(false);
		mounted.root.unmount();
		const live = renderCore({ grid: [10, 10], scale: 1 });
		live.node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		const replacementDrag = vi.fn();
		live.root.render(CoreHarness, {
			nodeRef: live.nodeRef,
			enableUserSelectHack: false,
			onStart: live.onStart,
			onDrag: replacementDrag,
			onStop: live.onStop,
			onMouseDown: live.onMouseDown,
			grid: [5, 5],
			scale: 2,
			disabled: true,
		});
		flushSync(() => {});
		document.dispatchEvent(
			new MouseEvent('mousemove', { bubbles: true, clientX: 12, clientY: 12 }),
		);
		expect(replacementDrag).toHaveBeenCalledTimes(1);
		expect(replacementDrag.mock.calls[0][1]).toMatchObject({ x: 5, y: 5, deltaX: 5, deltaY: 5 });
		live.root.unmount();
	});
});

describe('owner-document replacement and thrown callbacks', () => {
	// @parity-case adapted:core-owner-document
	it('removes stop resources from the live node document and retains original listeners', () => {
		const mounted = renderCore(),
			replacementFrame = document.createElement('iframe');
		document.body.appendChild(replacementFrame);
		const replacement = replacementFrame.contentDocument!.createElement('div');
		replacementFrame.contentDocument!.body.appendChild(replacement);
		mounted.node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		mounted.nodeRef.current = replacement;
		document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 2, clientY: 2 }));
		document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 3, clientY: 3 }));
		expect(mounted.onStop).toHaveBeenCalledTimes(1);
		expect(mounted.onDrag).toHaveBeenCalledTimes(1);
		mounted.root.unmount();
	});

	// @parity-case adapted:core-start-errors
	it('propagates start callback errors before global resources exist', () => {
		const error = new Error('start exploded');
		const add = vi.spyOn(document, 'addEventListener');
		const mounted = renderCore({
			onStart: vi.fn(() => {
				throw error;
			}),
		});
		add.mockClear();
		const caught: Error[] = [];
		const onError = (event: ErrorEvent) => {
			caught.push(event.error);
			event.preventDefault();
		};
		window.addEventListener('error', onError);
		mounted.node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		window.removeEventListener('error', onError);
		expect(caught).toContain(error);
		expect(add.mock.calls.some(([name]) => name === 'mousemove' || name === 'mouseup')).toBe(false);
		mounted.root.unmount();
	});
});

// @parity-case adapted:core-child-contract
it('accepts a standard compiled tsrx child', () => {
	const container = document.createElement('div');
	const root = createRoot(container);
	expect(() => {
		root.render(StandardChildrenHarness, {});
		flushSync(() => {});
	}).not.toThrow();
	const caught: Error[] = [];
	const onError = (event: ErrorEvent) => {
		caught.push(event.error);
		event.preventDefault();
	};
	window.addEventListener('error', onError);
	container.querySelector('div')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
	window.removeEventListener('error', onError);
	expect(caught[0]?.message).toBe('<DraggableCore> not mounted on DragStart!');
	root.unmount();
});
