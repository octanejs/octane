import {
	createRoot,
	flushSync,
	hydrateRoot,
	setTransitionFallbackTimeout,
} from '../../../src/index.js';
import * as React from 'react';
import { flushSync as flushReactSync } from 'react-dom';
import { createRoot as createReactRoot } from 'react-dom/client';
import * as hydration from '../../conformance/_fixtures/fizz-readiness-hydration.tsrx';
import {
	DirectRootRefUnmountApp,
	SuspensePreservationApp,
} from '../../_fixtures/suspense-preserves-dom.tsrx';

type Controls = {
	urgent(next: string): void;
	transition(next: string): void;
};

type Deferred<T> = {
	promise: Promise<T>;
	resolve(value: T): void;
};

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => (resolve = res));
	return { promise, resolve };
}

function fulfilled<T>(value: T): PromiseLike<T> {
	return { then() {}, status: 'fulfilled', value } as any;
}

function makeStore() {
	let value = 0;
	const listeners = new Set<() => void>();
	return {
		get: () => value,
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		listenerCount: () => listeners.size,
	};
}

const globalFailures: string[] = [];
window.addEventListener('error', (event) => globalFailures.push(`error: ${event.message}`));
window.addEventListener('unhandledrejection', (event) =>
	globalFailures.push(`unhandledrejection: ${String(event.reason)}`),
);

const search = new URLSearchParams(location.search);
const testCase = search.get('case');

function mountHydrationCase(): void {
	const container = document.querySelector('#hydration-root') as HTMLElement;
	const capturedBoundary = container.querySelector('#mismatch-hydration-boundary');
	const capturedOutside = container.querySelector('#hydration-outside');
	const module = deferred<{ default: typeof hydration.HydrationLeaf }>();
	hydration.setMismatchHydrationModule(module.promise);
	const root = hydrateRoot(container, hydration.MismatchHydrationBoundary, {
		client: true,
		text: 'replaced',
	});
	flushSync(() => {});

	window.__suspenseHydration = {
		kind: 'hydration',
		resolve() {
			module.resolve({ default: hydration.HydrationLeaf });
		},
		unmount() {
			root.unmount();
		},
		snapshot() {
			return {
				boundarySame: container.querySelector('#mismatch-hydration-boundary') === capturedBoundary,
				outsideSame: container.querySelector('#hydration-outside') === capturedOutside,
				outsideText: capturedOutside?.textContent?.trim() ?? '',
				fallbackCount: container.querySelectorAll('.hydration-fallback').length,
				headings: Array.from(
					container.querySelectorAll('#hydration-text'),
					(node) => node.textContent,
				),
				globalFailures: globalFailures.slice(),
			};
		},
	};
}

function mountSuspenseCase(): void {
	const container = document.querySelector('#suspense-root') as HTMLElement;
	const portalTarget = document.querySelector('#suspense-portal-root') as HTMLElement;
	const routeB = deferred<string>();
	const promises = new Map<string, PromiseLike<string>>([
		['A', fulfilled('A')],
		['B', routeB.promise],
	]);
	const store = makeStore();
	const lifecycle: string[] = [];
	const refLifecycle: string[] = [];
	let controls!: Controls;
	const root = createRoot(container);
	root.render(SuspensePreservationApp, {
		shape: search.get('shape') === 'same' ? 'same' : 'swap',
		promiseFor: (route: string) => promises.get(route)!,
		portalTarget,
		store,
		log: lifecycle,
		portalRef: (node: Element | null) => refLifecycle.push(node ? 'attach' : 'detach'),
		directText: 'direct primary text',
		bind(value: Controls) {
			controls = value;
		},
	});

	const captured = {
		panel: container.querySelector('#preserved-panel') as HTMLElement,
		input: container.querySelector('#preserved-input') as HTMLInputElement,
		scroller: container.querySelector('#preserved-scroller') as HTMLElement,
		editable: container.querySelector('#preserved-editable') as HTMLElement,
		portal: portalTarget.querySelector('#preserved-portal') as HTMLElement,
	};
	const editableText = captured.editable.firstChild!;

	function snapshot() {
		const selection = getSelection();
		return {
			panelSame: container.querySelector('#preserved-panel') === captured.panel,
			inputSame: container.querySelector('#preserved-input') === captured.input,
			scrollerSame: container.querySelector('#preserved-scroller') === captured.scroller,
			editableSame: container.querySelector('#preserved-editable') === captured.editable,
			portalSame: portalTarget.querySelector('#preserved-portal') === captured.portal,
			panelConnected: captured.panel.isConnected,
			portalConnected: captured.portal.isConnected,
			panelVisible: captured.panel.checkVisibility(),
			portalVisible: captured.portal.checkVisibility(),
			activeId: (document.activeElement as HTMLElement | null)?.id ?? '',
			inputValue: captured.input.value,
			selectionStart: captured.input.selectionStart,
			selectionEnd: captured.input.selectionEnd,
			scrollTop: captured.scroller.scrollTop,
			countText: captured.panel.querySelector('#preserved-count')?.textContent?.trim() ?? '',
			rangeAnchored:
				selection?.anchorNode === editableText && selection?.focusNode === editableText,
			rangeStart: selection?.anchorOffset ?? -1,
			rangeEnd: selection?.focusOffset ?? -1,
			fallbackCount: container.querySelectorAll('#preserved-fallback').length,
			routeText: container.querySelector('#preserved-route')?.textContent ?? '',
			transitionText: container.querySelector('#preserved-transition')?.textContent ?? '',
			lifecycle: lifecycle.slice(),
			refLifecycle: refLifecycle.slice(),
			listenerCount: store.listenerCount(),
			globalFailures: globalFailures.slice(),
		};
	}

	window.__suspenseHydration = {
		kind: 'suspense',
		prepareInput() {
			flushSync(() => (container.querySelector('#preserved-count') as HTMLButtonElement).click());
			captured.input.value = 'browser-owned value';
			captured.input.focus();
			captured.input.setSelectionRange(2, 9);
			captured.scroller.scrollTop = 800;
			return snapshot();
		},
		prepareRange() {
			captured.editable.focus();
			const range = document.createRange();
			range.setStart(editableText, 2);
			range.setEnd(editableText, 12);
			const selection = getSelection()!;
			selection.removeAllRanges();
			selection.addRange(range);
			captured.scroller.scrollTop = 800;
			return snapshot();
		},
		urgent() {
			flushSync(() => controls.urgent('B'));
		},
		transition() {
			flushSync(() => controls.transition('B'));
		},
		setFallbackTimeout(ms: number) {
			setTransitionFallbackTimeout(ms);
		},
		resolve() {
			routeB.resolve('B');
		},
		unmount() {
			root.unmount();
		},
		snapshot,
	};
}

function mountDirectRefUnmountCase(): void {
	const container = document.querySelector('#suspense-root') as HTMLElement;
	const pending = deferred<string>();
	const ready = fulfilled('ready');
	const root = createRoot(container);
	const refLifecycle: string[] = [];
	const inputRef = (node: Element | null) => {
		refLifecycle.push(node ? 'attach' : 'detach');
		if (node === null) root.unmount();
	};

	root.render(DirectRootRefUnmountApp, { promise: ready, inputRef });
	const capturedInput = container.querySelector('#direct-ref-input') as HTMLInputElement;

	function snapshot() {
		return {
			rootEmpty: container.childNodes.length === 0,
			fallbackCount: container.querySelectorAll('#direct-ref-fallback').length,
			inputConnected: capturedInput.isConnected,
			refLifecycle: refLifecycle.slice(),
			globalFailures: globalFailures.slice(),
		};
	}

	window.__suspenseHydration = {
		kind: 'direct-ref-unmount',
		urgent() {
			flushSync(() =>
				root.render(DirectRootRefUnmountApp, {
					promise: pending.promise,
					inputRef,
				}),
			);
		},
		resolve() {
			pending.resolve('late');
		},
		unmount() {
			root.unmount();
		},
		snapshot,
	};
}

function mountReactBaselineCase(): void {
	const container = document.querySelector('#suspense-root') as HTMLElement;
	const routeB = deferred<string>();
	const routeA = fulfilled('A');
	let setPromise!: React.Dispatch<React.SetStateAction<PromiseLike<string>>>;

	function ReactRoute(props: { promise: PromiseLike<string> }) {
		const value = React.use(props.promise as PromiseLike<string>);
		return React.createElement('span', { id: 'react-route' }, `route:${value}`);
	}

	function ReactBaseline() {
		const [promise, setCurrentPromise] = React.useState<PromiseLike<string>>(routeA);
		setPromise = setCurrentPromise;
		return React.createElement(
			React.Suspense,
			{ fallback: React.createElement('span', { id: 'react-fallback' }, 'loading') },
			React.createElement('input', { id: 'react-input', defaultValue: 'react-owned value' }),
			React.createElement(ReactRoute, { promise }),
		);
	}

	const root = createReactRoot(container);
	flushReactSync(() => root.render(React.createElement(ReactBaseline)));
	const capturedInput = container.querySelector('#react-input') as HTMLInputElement;

	function snapshot() {
		return {
			reactVersion: React.version,
			inputSame: container.querySelector('#react-input') === capturedInput,
			inputConnected: capturedInput.isConnected,
			inputVisible: capturedInput.checkVisibility(),
			activeId: (document.activeElement as HTMLElement | null)?.id ?? '',
			fallbackCount: container.querySelectorAll('#react-fallback').length,
			routeText: container.querySelector('#react-route')?.textContent ?? '',
			globalFailures: globalFailures.slice(),
		};
	}

	window.__suspenseHydration = {
		kind: 'react-baseline',
		prepareInput() {
			capturedInput.focus();
			return snapshot();
		},
		urgent() {
			flushReactSync(() => setPromise(routeB.promise));
		},
		resolve() {
			routeB.resolve('B');
		},
		unmount() {
			root.unmount();
		},
		snapshot,
	};
}

if (testCase === 'hydration') mountHydrationCase();
else if (testCase === 'suspense') mountSuspenseCase();
else if (testCase === 'direct-ref-unmount') mountDirectRefUnmountCase();
else if (testCase === 'react-baseline') mountReactBaselineCase();

declare global {
	interface Window {
		__suspenseHydration: {
			kind: 'hydration' | 'suspense' | 'react-baseline' | 'direct-ref-unmount';
			prepareInput?: () => any;
			prepareRange?: () => any;
			urgent?: () => void;
			transition?: () => void;
			setFallbackTimeout?: (ms: number) => void;
			resolve: () => void;
			unmount: () => void;
			snapshot: () => any;
		};
	}
}
