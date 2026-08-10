import { afterEach, describe, expect, it } from 'vitest';
import { createRoot as createOctaneRoot, flushSync } from 'octane';
import { createElement, createRef, type ComponentType } from 'react';
import { createRoot as createReactRoot } from 'react-dom/client';
import { act } from 'react';
import ReactDraggable from '../../upstream/npm/build/cjs/cjs.mjs';
import { normaliseHtml } from '../../../octane/tests/differential/_rig';
import { DraggableHarness } from '../runtime/_fixtures/DraggableHarness.tsrx';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => document.body.replaceChildren());

function dispatch(node: Element | Document, type: string, clientX: number, clientY: number) {
	node.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX, clientY }));
}

describe('differential: @octanejs/react-draggable vs react-draggable@4.7.1', () => {
	// @parity-case differential:react-draggable-basic
	it('matches child cloning, snapped movement, classes, and transforms', async () => {
		const octaneContainer = document.body.appendChild(document.createElement('div'));
		const reactContainer = document.body.appendChild(document.createElement('div'));
		const octaneRef = { current: null as HTMLDivElement | null };
		const reactRef = createRef<HTMLDivElement>();
		const octaneRoot = createOctaneRoot(octaneContainer);
		flushSync(() =>
			octaneRoot.render(DraggableHarness, {
				nodeRef: octaneRef,
				defaultPosition: { x: 2, y: 3 },
				grid: [5, 5],
			}),
		);
		const reactRoot = createReactRoot(reactContainer);
		await act(() =>
			reactRoot.render(
				createElement(
					ReactDraggable as unknown as ComponentType<Record<string, unknown>>,
					{ nodeRef: reactRef, defaultPosition: { x: 2, y: 3 }, grid: [5, 5] },
					createElement(
						'div',
						{ ref: reactRef, className: 'child', style: { color: 'red' }, 'data-kept': 'yes' },
						'drag',
					),
				),
			),
		);
		expect(normaliseHtml(octaneContainer.innerHTML)).toBe(normaliseHtml(reactContainer.innerHTML));
		flushSync(() => dispatch(octaneRef.current!, 'mousedown', 10, 10));
		flushSync(() => dispatch(document, 'mousemove', 18, 24));
		flushSync(() => dispatch(document, 'mouseup', 18, 24));
		await act(() => dispatch(reactRef.current!, 'mousedown', 10, 10));
		await act(() => dispatch(document, 'mousemove', 18, 24));
		await act(() => dispatch(document, 'mouseup', 18, 24));
		expect(normaliseHtml(octaneContainer.innerHTML)).toBe(normaliseHtml(reactContainer.innerHTML));
		octaneRoot.unmount();
		await act(() => reactRoot.unmount());
	});
});
