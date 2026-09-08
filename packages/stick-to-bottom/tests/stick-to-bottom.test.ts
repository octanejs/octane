import { cleanup, render, renderHook } from '@octanejs/testing-library';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
	StickToBottom,
	useStickToBottom,
	useStickToBottomContext,
} from '@octanejs/stick-to-bottom';
import {
	ContentRenderPropStickProbe,
	HookProbe,
	RenderPropStickProbe,
	StickProbe,
} from './_fixtures/probes.tsrx';

const originalResizeObserver = globalThis.ResizeObserver;

class ResizeObserverMock {
	static observed = new Set<Element>();

	observe(element: Element): void {
		ResizeObserverMock.observed.add(element);
	}

	unobserve(element: Element): void {
		ResizeObserverMock.observed.delete(element);
	}

	disconnect(): void {
		ResizeObserverMock.observed.clear();
	}
}

beforeAll(function installResizeObserver() {
	globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
});

afterAll(function restoreResizeObserver() {
	globalThis.ResizeObserver = originalResizeObserver;
});

afterEach(function resetDom() {
	cleanup();
	ResizeObserverMock.observed.clear();
	document.body.replaceChildren();
	document.head.querySelectorAll('[data-stick-test]').forEach(function removeStyle(style) {
		style.remove();
	});
});

describe('useStickToBottom', function hookSuite() {
	// Per packages/stick-to-bottom/upstream/src/useStickToBottom.ts
	it('returns scroll and content refs', function returnsRefs() {
		const { result } = renderHook(function useHook() {
			return useStickToBottom();
		});
		expect(typeof result.current.scrollRef).toBe('function');
		expect(typeof result.current.contentRef).toBe('function');
		expect(typeof result.current.scrollToBottom).toBe('function');
		expect(typeof result.current.stopScroll).toBe('function');
		expect(result.current.isAtBottom).toBe(true);
	});

	it('attaches its scroll and content refs', function attachesRefs() {
		const { result } = renderHook(function useHook() {
			return useStickToBottom();
		});
		const scroll = document.createElement('div');
		const content = document.createElement('div');

		result.current.scrollRef(scroll);
		result.current.contentRef(content);

		expect(result.current.scrollRef.current).toBe(scroll);
		expect(result.current.contentRef.current).toBe(content);
		expect(ResizeObserverMock.observed).toContain(content);

		result.current.contentRef(null);
		result.current.scrollRef(null);
		expect(result.current.scrollRef.current).toBeNull();
		expect(result.current.contentRef.current).toBeNull();
	});

	it('exposes StickToBottom.Content as the content component', function namespace() {
		expect(StickToBottom.Content).toBeTypeOf('function');
	});
});

describe('useStickToBottomContext', function contextSuite() {
	it('throws outside StickToBottom', function throwsOutside() {
		expect(function renderOutside() {
			render(HookProbe);
		}).toThrow(/must be used within a StickToBottom/);
	});
});

describe('StickToBottom', function componentSuite() {
	it('renders content and sets overflow auto on the scroll element', function overflowAuto() {
		const style = document.createElement('style');
		style.dataset.stickTest = '';
		style.textContent = '.scroll { overflow: visible; }';
		document.head.appendChild(style);

		const { container } = render(StickProbe);
		const scroll = container.querySelector('.scroll') as HTMLElement | null;
		expect(scroll).not.toBeNull();
		expect(scroll?.style.overflow).toBe('auto');
		expect(container.querySelector('[data-content]')).not.toBeNull();
		expect(container.textContent).toContain('hello');
	});

	it('invokes function children with the stick-to-bottom context', function renderProp() {
		const { container } = render(RenderPropStickProbe);
		expect(container.textContent).toContain('bottom');
	});

	it('invokes content function children with the stick-to-bottom context', function contentRenderProp() {
		const { container } = render(ContentRenderPropStickProbe);
		expect(container.textContent).toContain('content-bottom');
	});
});
