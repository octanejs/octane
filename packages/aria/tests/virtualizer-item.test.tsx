/** @jsxImportSource octane */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, flushEffects, mount } from '../../octane/tests/_helpers';
import { LayoutInfo, Rect } from '../src/upstream-exports/react-stately/useVirtualizerState';
import { VirtualizerItem } from '../src/virtualizer/VirtualizerItem';

class ResizeObserverMock {
	static instances: ResizeObserverMock[] = [];
	readonly targets = new Set<Element>();
	readonly callback: ResizeObserverCallback;

	constructor(callback: ResizeObserverCallback) {
		this.callback = callback;
		ResizeObserverMock.instances.push(this);
	}

	observe(target: Element): void {
		this.targets.add(target);
	}

	disconnect(): void {
		this.targets.clear();
	}

	static resize(target: Element): void {
		for (const observer of this.instances) {
			if (observer.targets.has(target)) {
				observer.callback(
					[{ target } as ResizeObserverEntry],
					observer as unknown as ResizeObserver,
				);
			}
		}
	}
}

const layoutInfo = new LayoutInfo('item', 'row', new Rect(0, 0, 100, 24));
const updateItemSize = vi.fn();
const virtualizer = { updateItemSize };

function Item(props: { shouldObserveItemSize: boolean }) {
	return (
		<VirtualizerItem
			layoutInfo={layoutInfo}
			virtualizer={virtualizer}
			shouldObserveItemSize={props.shouldObserveItemSize}
		>
			<div data-testid="content">Expandable item</div>
		</VirtualizerItem>
	);
}

beforeEach(() => {
	ResizeObserverMock.instances.length = 0;
	updateItemSize.mockClear();
	vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('VirtualizerItem', () => {
	it('remeasures an item when observed content grows', async () => {
		const result = mount(Item, { shouldObserveItemSize: true });
		try {
			flushEffects();
			const wrapper = result.container.querySelector('[role="presentation"]') as HTMLElement;
			const content = result.container.querySelector('[data-testid="content"]')!;
			let height = 24;
			Object.defineProperties(wrapper, {
				scrollWidth: { get: () => 100 },
				scrollHeight: { get: () => height },
			});

			height = 84;
			await act(() => ResizeObserverMock.resize(content));
			expect(updateItemSize).toHaveBeenCalledWith(
				'row',
				expect.objectContaining({ width: 100, height: 84 }),
			);
		} finally {
			result.unmount();
		}
	});
});
