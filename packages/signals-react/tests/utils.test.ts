// Per packages/signals-react/upstream/canonical/utils/test/browser/index.test.tsx
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@octanejs/testing-library';
import { createElement as h } from 'octane';
import { signal } from '@preact/signals-core';
import { ForList, LiveCount, ShowToggle, SignalRefProbe } from './_fixtures/utils.tsrx';

afterEach(cleanup);

function visibleHTML(node: HTMLElement): string {
	return node.innerHTML.replace(/<!--[\s\S]*?-->/g, '');
}

describe('Show', function showSuite() {
	it('Should reactively show an element', function reactiveShow() {
		const toggle = signal(false);
		const view = render(h(ShowToggle, { toggle }));
		expect(visibleHTML(view.container)).toBe('<p>Hiding</p>');
		act(function show() {
			toggle.value = true;
		});
		expect(visibleHTML(view.container)).toBe('<p>Showing</p>');
	});
});

describe('For', function forSuite() {
	it('renders each item and the empty fallback', function eachAndEmpty() {
		const items = signal(['a']);
		const view = render(h(ForList, { items }));
		expect(view.container.querySelector('li')!.textContent).toBe('a');
		act(function clear() {
			items.value = [];
		});
		expect(visibleHTML(view.container)).toBe('<p>empty</p>');
	});
});

describe('useLiveSignal', function liveSuite() {
	it('should work', function live() {
		const logs: string[] = [];
		const view = render(h(LiveCount, { count: 0, logs }));
		expect(visibleHTML(view.container)).toBe('<p>0</p>');
		expect(logs).toEqual(['Count is 0']);
		view.rerender(h(LiveCount, { count: 1, logs }));
		expect(visibleHTML(view.container)).toBe('<p>1</p>');
		expect(logs).toEqual(['Count is 0', 'Count is 1']);
	});
});

describe('useSignalRef', function refSuite() {
	it('exposes current as the signal value', function current() {
		const view = render(h(SignalRefProbe, { value: 'hello' }));
		expect(visibleHTML(view.container)).toBe('<p>hello</p>');
	});
});
