import { expectTypeOf, test } from 'vitest';
import { useVirtualizer, useWindowVirtualizer } from '../src';
import type { ReactVirtualizer } from '../src';

test('element and window virtualizers preserve element types and public methods', () => {
	const element = useVirtualizer<HTMLDivElement, HTMLSpanElement>({
		count: 10,
		getScrollElement: () => null,
		estimateSize: () => 24,
	});
	const windowed = useWindowVirtualizer<HTMLLIElement>({ count: 10, estimateSize: () => 24 });

	expectTypeOf(element).toExtend<ReactVirtualizer<HTMLDivElement, HTMLSpanElement>>();
	expectTypeOf(windowed).toExtend<ReactVirtualizer<Window, HTMLLIElement>>();
	expectTypeOf(element.getVirtualItems()).toBeArray();
	expectTypeOf(element.scrollToIndex).toBeFunction();
	expectTypeOf(element.containerRef).toBeFunction();
});
