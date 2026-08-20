import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { describe, expect, it, vi } from 'vitest';
import DraggableCore from '../../upstream/lib/DraggableCore.tsx';

function instance(overrides: Record<string, unknown> = {}) {
	return new DraggableCore({
		...DraggableCore.defaultProps,
		children: React.createElement('div', { id: 'child' }),
		...overrides,
	} as any);
}

describe('pristine React 19 characterization (upstream tag source)', () => {
	it('render and mount succeed without nodeRef and install no native touchstart', () => {
		const add = vi.spyOn(Node.prototype, 'addEventListener');
		const container = document.createElement('div');
		const root = createRoot(container);
		expect(() =>
			flushSync(() =>
				root.render(React.createElement(DraggableCore, null, React.createElement('div'))),
			),
		).not.toThrow();
		const child = container.firstElementChild;
		expect(
			add.mock.calls.some(
				([name], index) => name === 'touchstart' && add.mock.instances[index] === child,
			),
		).toBe(false);
		root.unmount();
		add.mockRestore();
	});

	it('cloned mouse start throws the exact missing-nodeRef error and touch cannot deliver', () => {
		const core = instance();
		core.mounted = true;
		const clone = core.render();
		expect(() => clone.props.onMouseDown(new MouseEvent('mousedown', { button: 0 }))).toThrow(
			'<DraggableCore> not mounted on DragStart!',
		);
		expect(clone.props.onTouchStart).toBeUndefined();
	});

	it('retains child type/non-drag props/style/class/ref while replacing three handlers', () => {
		const ref = React.createRef<HTMLDivElement>();
		const originals = { onMouseDown: vi.fn(), onMouseUp: vi.fn(), onTouchEnd: vi.fn() };
		const child = React.createElement('div', {
			id: 'kept',
			className: 'kept',
			style: { color: 'red' },
			ref,
			...originals,
		});
		const core = instance({ children: child });
		const clone = core.render();
		expect(clone.type).toBe(child.type);
		expect(clone.props).toMatchObject({
			id: 'kept',
			className: 'kept',
			style: { color: 'red' },
			ref,
		});
		expect(clone.props.onMouseDown).toBe(core.onMouseDown);
		expect(clone.props.onMouseUp).toBe(core.onMouseUp);
		expect(clone.props.onTouchEnd).toBe(core.onTouchEnd);
	});

	it('re-resolves replacement node/document for teardown, retaining original resources', () => {
		const original = document.implementation.createHTMLDocument('original');
		const replacement = document.implementation.createHTMLDocument('replacement');
		const originalNode = original.createElement('div');
		const replacementNode = replacement.createElement('div');
		const nodeRef = { current: originalNode };
		const originalRemove = vi.spyOn(originalNode, 'removeEventListener');
		const replacementRemove = vi.spyOn(replacementNode, 'removeEventListener');
		const core = instance({ nodeRef, enableUserSelectHack: false });
		core.componentDidMount();
		nodeRef.current = replacementNode;
		core.componentWillUnmount();
		expect(originalRemove).not.toHaveBeenCalledWith(
			'touchstart',
			core.onTouchStart,
			expect.anything(),
		);
		expect(replacementRemove).toHaveBeenCalledWith('touchstart', core.onTouchStart, {
			capture: true,
			passive: false,
		});
	});
});
