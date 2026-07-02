// Ported from @radix-ui/react-focus-scope. Traps and/or loops Tab focus within its
// subtree, autofocuses the first tabbable on mount and restores focus on unmount (both
// preventable via the `focusScope.autoFocusOnMount`/`autoFocusOnUnmount` custom events),
// and pauses lower scopes via a module-level stack. Pure DOM + octane hooks; React's
// `useCallbackRef` → octane `useEffectEvent`.
import { createElement, useCallback, useEffect, useEffectEvent, useRef, useState } from 'octane';

import { useComposedRefs } from './compose-refs';
import { S, subSlot } from './internal';
import { Primitive } from './Primitive';

const AUTOFOCUS_ON_MOUNT = 'focusScope.autoFocusOnMount';
const AUTOFOCUS_ON_UNMOUNT = 'focusScope.autoFocusOnUnmount';
const EVENT_OPTIONS = { bubbles: false, cancelable: true };

interface FocusScopeAPI {
	paused: boolean;
	pause(): void;
	resume(): void;
}

export function FocusScope(props: any): any {
	const slot = S('FocusScope');
	const {
		loop = false,
		trapped = false,
		onMountAutoFocus: onMountAutoFocusProp,
		onUnmountAutoFocus: onUnmountAutoFocusProp,
		ref: forwardedRef,
		...scopeProps
	} = props ?? {};
	const [container, setContainer] = useState<HTMLElement | null>(null, subSlot(slot, 'node'));
	const onMountAutoFocus = useEffectEvent(
		onMountAutoFocusProp ?? (() => {}),
		subSlot(slot, 'mountCb'),
	);
	const onUnmountAutoFocus = useEffectEvent(
		onUnmountAutoFocusProp ?? (() => {}),
		subSlot(slot, 'unmountCb'),
	);
	const lastFocusedElementRef = useRef<HTMLElement | null>(null, subSlot(slot, 'last'));
	const composedRefs = useComposedRefs(forwardedRef, setContainer, subSlot(slot, 'refs'));

	const focusScope = useRef<FocusScopeAPI>(
		{
			paused: false,
			pause() {
				this.paused = true;
			},
			resume() {
				this.paused = false;
			},
		},
		subSlot(slot, 'api'),
	).current;

	// Focus containment: keep focus inside `container` while trapped.
	useEffect(
		() => {
			if (!trapped) return;
			function handleFocusIn(event: FocusEvent): void {
				if (focusScope.paused || !container) return;
				const target = event.target as HTMLElement | null;
				if (container.contains(target)) {
					lastFocusedElementRef.current = target;
				} else {
					focus(lastFocusedElementRef.current, { select: true });
				}
			}
			function handleFocusOut(event: FocusEvent): void {
				if (focusScope.paused || !container) return;
				const relatedTarget = event.relatedTarget as HTMLElement | null;
				if (relatedTarget === null) return;
				if (!container.contains(relatedTarget)) {
					focus(lastFocusedElementRef.current, { select: true });
				}
			}
			// When the focused element gets removed from the DOM, move focus back to the
			// container (browsers move it to body).
			function handleMutations(mutations: MutationRecord[]): void {
				const focusedElement = document.activeElement;
				if (focusedElement !== document.body) return;
				for (const mutation of mutations) {
					if (mutation.removedNodes.length > 0) focus(container);
				}
			}
			document.addEventListener('focusin', handleFocusIn);
			document.addEventListener('focusout', handleFocusOut);
			const mutationObserver = new MutationObserver(handleMutations);
			if (container) mutationObserver.observe(container, { childList: true, subtree: true });
			return () => {
				document.removeEventListener('focusin', handleFocusIn);
				document.removeEventListener('focusout', handleFocusOut);
				mutationObserver.disconnect();
			};
		},
		[trapped, container],
		subSlot(slot, 'e:trap'),
	);

	// Mount/unmount autofocus + scope-stack registration.
	useEffect(
		() => {
			if (!container) return;
			focusScopesStack.add(focusScope);
			const previouslyFocusedElement = document.activeElement as HTMLElement | null;
			const hasFocusedCandidate = container.contains(previouslyFocusedElement);
			if (!hasFocusedCandidate) {
				const mountEvent = new CustomEvent(AUTOFOCUS_ON_MOUNT, EVENT_OPTIONS);
				container.addEventListener(AUTOFOCUS_ON_MOUNT, onMountAutoFocus);
				container.dispatchEvent(mountEvent);
				if (!mountEvent.defaultPrevented) {
					focusFirst(removeLinks(getTabbableCandidates(container)), { select: true });
					if (document.activeElement === previouslyFocusedElement) {
						focus(container);
					}
				}
			}
			return () => {
				container.removeEventListener(AUTOFOCUS_ON_MOUNT, onMountAutoFocus);
				setTimeout(() => {
					const unmountEvent = new CustomEvent(AUTOFOCUS_ON_UNMOUNT, EVENT_OPTIONS);
					container.addEventListener(AUTOFOCUS_ON_UNMOUNT, onUnmountAutoFocus);
					container.dispatchEvent(unmountEvent);
					if (!unmountEvent.defaultPrevented) {
						focus(previouslyFocusedElement ?? document.body, { select: true });
					}
					container.removeEventListener(AUTOFOCUS_ON_UNMOUNT, onUnmountAutoFocus);
					focusScopesStack.remove(focusScope);
				}, 0);
			};
		},
		[container],
		subSlot(slot, 'e:mount'),
	);

	const handleKeyDown = useCallback(
		(event: KeyboardEvent) => {
			if (!loop && !trapped) return;
			if (focusScope.paused) return;
			const isTabKey = event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey;
			const focusedElement = document.activeElement as HTMLElement | null;
			if (isTabKey && focusedElement) {
				const scopeContainer = event.currentTarget as HTMLElement;
				const [first, last] = getTabbableEdges(scopeContainer);
				const hasTabbableElementsInside = first && last;
				if (!hasTabbableElementsInside) {
					if (focusedElement === scopeContainer) event.preventDefault();
				} else {
					if (!event.shiftKey && focusedElement === last) {
						event.preventDefault();
						if (loop) focus(first, { select: true });
					} else if (event.shiftKey && focusedElement === first) {
						event.preventDefault();
						if (loop) focus(last, { select: true });
					}
				}
			}
		},
		[loop, trapped],
		subSlot(slot, 'keydown'),
	);

	return createElement(Primitive.div, {
		tabIndex: -1,
		...scopeProps,
		ref: composedRefs,
		onKeyDown: handleKeyDown,
	});
}

export { FocusScope as Root };

function focusFirst(candidates: HTMLElement[], { select = false } = {}): void {
	const previouslyFocusedElement = document.activeElement;
	for (const candidate of candidates) {
		focus(candidate, { select });
		if (document.activeElement !== previouslyFocusedElement) return;
	}
}

function getTabbableEdges(
	container: HTMLElement,
): [HTMLElement | undefined, HTMLElement | undefined] {
	const candidates = getTabbableCandidates(container);
	const first = findVisible(candidates, container);
	const last = findVisible(candidates.reverse(), container);
	return [first, last];
}

function getTabbableCandidates(container: HTMLElement): HTMLElement[] {
	const nodes: HTMLElement[] = [];
	const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, {
		acceptNode: (node: any) => {
			const isHiddenInput = node.tagName === 'INPUT' && node.type === 'hidden';
			if (node.disabled || node.hidden || isHiddenInput) return NodeFilter.FILTER_SKIP;
			return node.tabIndex >= 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
		},
	});
	while (walker.nextNode()) nodes.push(walker.currentNode as HTMLElement);
	return nodes;
}

function findVisible(elements: HTMLElement[], container: HTMLElement): HTMLElement | undefined {
	for (const element of elements) {
		if (!isHidden(element, { upTo: container })) return element;
	}
}

function isHidden(node: HTMLElement | null, { upTo }: { upTo?: HTMLElement }): boolean {
	if (!node) return false;
	if (getComputedStyle(node).visibility === 'hidden') return true;
	while (node) {
		if (upTo !== undefined && node === upTo) return false;
		if (getComputedStyle(node).display === 'none') return true;
		node = node.parentElement;
	}
	return false;
}

function isSelectableInput(element: any): element is HTMLInputElement {
	return element instanceof HTMLInputElement && 'select' in element;
}

function focus(element: HTMLElement | null, { select = false } = {}): void {
	if (element && element.focus) {
		const previouslyFocusedElement = document.activeElement;
		element.focus({ preventScroll: true });
		if (element !== previouslyFocusedElement && isSelectableInput(element) && select) {
			element.select();
		}
	}
}

const focusScopesStack = createFocusScopesStack();
function createFocusScopesStack(): {
	add(focusScope: FocusScopeAPI): void;
	remove(focusScope: FocusScopeAPI): void;
} {
	let stack: FocusScopeAPI[] = [];
	return {
		add(focusScope) {
			const activeFocusScope = stack[0];
			if (focusScope !== activeFocusScope) {
				activeFocusScope?.pause();
			}
			stack = arrayRemove(stack, focusScope);
			stack.unshift(focusScope);
		},
		remove(focusScope) {
			stack = arrayRemove(stack, focusScope);
			stack[0]?.resume();
		},
	};
}

function arrayRemove<T>(array: T[], item: T): T[] {
	const updatedArray = [...array];
	const index = updatedArray.indexOf(item);
	if (index !== -1) updatedArray.splice(index, 1);
	return updatedArray;
}

function removeLinks(items: HTMLElement[]): HTMLElement[] {
	return items.filter((item) => item.tagName !== 'A');
}
