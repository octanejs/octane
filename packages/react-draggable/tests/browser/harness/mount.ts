import Draggable from '@octanejs/react-draggable';
import { createElement, createRoot, useRef, useState, type OctaneNode } from 'octane';

type DragSample = { x: number; y: number; deltaX?: number; deltaY?: number };

type HostApi = {
	dragData: DragSample | null;
	lastPosition: { x: number; y: number } | null;
	stopCalled: boolean;
	dragCallCount: number;
	errorThrown: boolean;
	inputBlurred: boolean;
	setVisible: ((value: boolean) => void) | null;
	setShowDraggable: ((value: boolean) => void) | null;
};

declare global {
	interface Window {
		__reactDraggableBrowser: {
			mount(spec: MountSpec): void;
			api: HostApi;
		};
	}
}

export type MountSpec =
	| { kind: 'basic'; props?: Record<string, unknown>; style?: Record<string, string> }
	| { kind: 'parent-bounds' }
	| { kind: 'handle' }
	| { kind: 'nested-handle' }
	| { kind: 'nested-cancel' }
	| { kind: 'iframe' }
	| { kind: 'iframe-bounds' }
	| { kind: 'shadow-parent' }
	| { kind: 'shadow-selector' }
	| { kind: 'unmount-on-stop' }
	| { kind: 'focus-unmount' }
	| { kind: 'focus-drag' }
	| { kind: 'offset' };

const api: HostApi = {
	dragData: null,
	lastPosition: null,
	stopCalled: false,
	dragCallCount: 0,
	errorThrown: false,
	inputBlurred: false,
	setVisible: null,
	setShowDraggable: null,
};

let root: ReturnType<typeof createRoot> | null = null;
let host: HTMLElement | null = null;

function resetApi(): void {
	api.dragData = null;
	api.lastPosition = null;
	api.stopCalled = false;
	api.dragCallCount = 0;
	api.errorThrown = false;
	api.inputBlurred = false;
	api.setVisible = null;
	api.setShowDraggable = null;
}

function boxStyle(extra: Record<string, string> = {}): Record<string, string> {
	return {
		width: '100px',
		height: '100px',
		background: 'blue',
		...extra,
	};
}

function BasicFixture(props: {
	draggableProps?: Record<string, unknown>;
	style?: Record<string, string>;
	children?: OctaneNode;
}): OctaneNode {
	const ref = useRef<HTMLDivElement | null>(null);
	return createElement(
		Draggable,
		{
			nodeRef: ref,
			...props.draggableProps,
		},
		props.children ??
			createElement('div', {
				ref,
				id: 'draggable-test',
				style: boxStyle(props.style ?? {}),
			}),
	);
}

function ParentBoundsFixture(): OctaneNode {
	const ref = useRef<HTMLDivElement | null>(null);
	return createElement(
		'div',
		{
			id: 'parent',
			style: {
				width: '300px',
				height: '300px',
				position: 'relative',
				background: '#ccc',
			},
		},
		createElement(
			Draggable,
			{ bounds: 'parent', nodeRef: ref },
			createElement('div', {
				ref,
				id: 'draggable-test',
				style: boxStyle(),
			}),
		),
	);
}

function HandleFixture(props: { nested?: boolean }): OctaneNode {
	const ref = useRef<HTMLDivElement | null>(null);
	const handleChild = props.nested
		? createElement(
				'div',
				{ className: 'handle' },
				createElement(
					'div',
					null,
					createElement(
						'span',
						null,
						createElement('div', {
							className: 'deep',
							style: { width: '50px', height: '50px', background: 'red' },
						}),
					),
				),
			)
		: createElement('div', {
				className: 'handle',
				style: { width: '50px', height: '50px', background: 'red' },
			});
	return createElement(
		Draggable,
		{ handle: '.handle', nodeRef: ref },
		createElement(
			'div',
			{
				ref,
				id: 'draggable-test',
				style: { width: '200px', height: '100px', background: 'blue' },
			},
			handleChild,
			createElement('div', {
				className: 'content',
				style: { width: '50px', height: '50px', background: 'green' },
			}),
		),
	);
}

function CancelFixture(): OctaneNode {
	const ref = useRef<HTMLDivElement | null>(null);
	return createElement(
		Draggable,
		{ cancel: '.cancel', nodeRef: ref },
		createElement(
			'div',
			{
				ref,
				id: 'draggable-test',
				style: { width: '200px', height: '100px', background: 'blue' },
			},
			createElement(
				'div',
				{ className: 'cancel' },
				createElement(
					'div',
					null,
					createElement(
						'span',
						null,
						createElement('div', {
							className: 'deep',
							style: { width: '50px', height: '50px', background: 'red' },
						}),
					),
				),
			),
			createElement('div', {
				className: 'content',
				style: { width: '50px', height: '50px', background: 'green' },
			}),
		),
	);
}

function UnmountOnStopFixture(): OctaneNode {
	const [visible, setVisible] = useState(true);
	const ref = useRef<HTMLDivElement | null>(null);
	api.setVisible = setVisible;
	if (!visible) return createElement('div', { id: 'unmounted' }, 'Unmounted');
	return createElement(
		Draggable,
		{
			nodeRef: ref,
			onStop: function onStop() {
				setVisible(false);
			},
		},
		createElement('div', {
			ref,
			id: 'draggable-test',
			style: boxStyle(),
		}),
	);
}

function FocusUnmountFixture(): OctaneNode {
	const [showDraggable, setShowDraggable] = useState(true);
	const ref = useRef<HTMLDivElement | null>(null);
	api.setShowDraggable = setShowDraggable;
	if (!showDraggable) return createElement('div', { id: 'draggable-slot' });
	return createElement(
		'div',
		{ id: 'draggable-slot' },
		createElement(
			Draggable,
			{ nodeRef: ref },
			createElement('div', {
				ref,
				id: 'draggable-test',
				style: boxStyle(),
			}),
		),
	);
}

function FocusDragFixture(): OctaneNode {
	const ref = useRef<HTMLDivElement | null>(null);
	return createElement(
		'div',
		null,
		createElement('input', {
			id: 'test-input-drag',
			type: 'text',
			style: { marginBottom: '20px', display: 'block' },
			onBlur: function onBlur() {
				api.inputBlurred = true;
			},
		}),
		createElement(
			Draggable,
			{ nodeRef: ref },
			createElement('div', {
				ref,
				id: 'draggable-focus-test',
				style: boxStyle(),
			}),
		),
	);
}

function renderInto(target: HTMLElement, node: unknown): void {
	if (root) {
		root.unmount();
		root = null;
	}
	target.replaceChildren();
	host = target;
	root = createRoot(target);
	root.render(node as never);
}

function mountShadow(
	spec: Extract<MountSpec, { kind: 'shadow-parent' | 'shadow-selector' }>,
): void {
	const rootEl = document.getElementById('root');
	if (!rootEl) throw new Error('missing #root');
	rootEl.replaceChildren();
	const shadowHost = document.createElement('div');
	shadowHost.id = spec.kind === 'shadow-parent' ? 'shadow-host' : 'shadow-host-2';
	rootEl.appendChild(shadowHost);
	const shadowRoot = shadowHost.attachShadow({ mode: 'open' });
	const container = document.createElement('div');
	container.id = spec.kind === 'shadow-parent' ? 'shadow-container' : 'bounds-container';
	container.style.cssText = 'position: relative; width: 200px; height: 200px; background: #ccc;';
	shadowRoot.appendChild(container);
	const nodeRef = { current: null as HTMLDivElement | null };
	const childId = spec.kind === 'shadow-parent' ? 'shadow-draggable' : 'shadow-draggable-2';
	const bounds = spec.kind === 'shadow-parent' ? 'parent' : '#bounds-container';
	if (root) {
		root.unmount();
		root = null;
	}
	root = createRoot(container);
	root.render(
		createElement(
			Draggable,
			{
				nodeRef,
				bounds,
				defaultPosition: { x: 50, y: 50 },
				onDrag: function onDrag(_event: Event, data: DragSample) {
					api.dragData = { x: data.x, y: data.y };
				},
			},
			createElement('div', {
				ref: nodeRef,
				id: childId,
				style: boxStyle(),
			}),
		),
	);
}

function mountIframeShell(spec: Extract<MountSpec, { kind: 'iframe' | 'iframe-bounds' }>): void {
	const rootEl = document.getElementById('root');
	if (!rootEl) throw new Error('missing #root');
	rootEl.replaceChildren();
	const iframe = document.createElement('iframe');
	iframe.id = spec.kind === 'iframe' ? 'test-iframe' : 'test-iframe-bounds';
	iframe.style.cssText = 'width: 500px; height: 500px; border: 1px solid black;';
	iframe.src = '/iframe.html';
	rootEl.appendChild(iframe);
}

function mountIframeContent(spec: Extract<MountSpec, { kind: 'iframe' | 'iframe-bounds' }>): void {
	const rootEl = document.getElementById('root');
	if (!rootEl) throw new Error('missing #root');
	if (spec.kind === 'iframe-bounds') {
		rootEl.style.cssText = 'position: relative; width: 300px; height: 300px; background: #ccc;';
	} else {
		rootEl.style.cssText = 'padding: 20px;';
	}
	const nodeRef = { current: null as HTMLDivElement | null };
	const childId = spec.kind === 'iframe' ? 'iframe-draggable' : 'iframe-draggable-bounds';
	renderInto(
		rootEl,
		createElement(
			Draggable,
			{
				nodeRef,
				...(spec.kind === 'iframe-bounds' ? { bounds: 'parent' } : {}),
			},
			createElement('div', {
				ref: nodeRef,
				id: childId,
				style: boxStyle(),
			}),
		),
	);
}

function withDragCallbacks(props: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		...props,
		onDrag: function onDrag(_event: Event, data: DragSample) {
			api.dragData = {
				x: data.x,
				y: data.y,
				deltaX: data.deltaX,
				deltaY: data.deltaY,
			};
			api.lastPosition = { x: data.x, y: data.y };
			api.dragCallCount += 1;
			const prior = props.onDrag;
			if (typeof prior === 'function') {
				(prior as (event: Event, sample: DragSample) => void)(_event, data);
			}
		},
		onStop: function onStop(_event: Event, data: DragSample) {
			api.stopCalled = true;
			const prior = props.onStop;
			if (typeof prior === 'function') {
				(prior as (event: Event, sample: DragSample) => void)(_event, data);
			}
		},
	};
}

function mount(spec: MountSpec): void {
	resetApi();
	const rootEl = document.getElementById('root');
	if (!rootEl) throw new Error('missing #root');
	if (spec.kind === 'iframe' || spec.kind === 'iframe-bounds') {
		if (window.top !== window) {
			mountIframeContent(spec);
			return;
		}
		mountIframeShell(spec);
		return;
	}
	if (spec.kind === 'shadow-parent' || spec.kind === 'shadow-selector') {
		mountShadow(spec);
		return;
	}
	if (spec.kind === 'parent-bounds') {
		renderInto(rootEl, createElement(ParentBoundsFixture));
		return;
	}
	if (spec.kind === 'handle') {
		renderInto(rootEl, createElement(HandleFixture));
		return;
	}
	if (spec.kind === 'nested-handle') {
		renderInto(rootEl, createElement(HandleFixture, { nested: true }));
		return;
	}
	if (spec.kind === 'nested-cancel') {
		renderInto(rootEl, createElement(CancelFixture));
		return;
	}
	if (spec.kind === 'unmount-on-stop') {
		renderInto(rootEl, createElement(UnmountOnStopFixture));
		return;
	}
	if (spec.kind === 'focus-unmount') {
		rootEl.replaceChildren();
		const input = document.createElement('input');
		input.id = 'test-input';
		input.type = 'text';
		input.addEventListener('blur', function onBlur() {
			api.inputBlurred = true;
		});
		const slot = document.createElement('div');
		slot.id = 'octane-slot';
		rootEl.append(input, slot);
		renderInto(slot, createElement(FocusUnmountFixture));
		return;
	}
	if (spec.kind === 'focus-drag') {
		renderInto(rootEl, createElement(FocusDragFixture));
		return;
	}
	if (spec.kind === 'offset') {
		renderInto(
			rootEl,
			createElement(BasicFixture, {
				draggableProps: withDragCallbacks(),
				style: {
					position: 'relative',
					top: '200px',
					left: '200px',
				},
			}),
		);
		return;
	}
	renderInto(
		rootEl,
		createElement(BasicFixture, {
			draggableProps: withDragCallbacks(spec.props ?? {}),
			style: spec.style,
		}),
	);
	void host;
}

window.__reactDraggableBrowser = { mount, api };
