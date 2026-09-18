import * as Expected from '@tanstack/react-virtual';
export interface ExpectedContracts {
	useVirtualizer: typeof Expected.useVirtualizer;
	useWindowVirtualizer: typeof Expected.useWindowVirtualizer;
	ReactVirtualizer: Expected.ReactVirtualizer<HTMLDivElement, HTMLDivElement>;
	ReactVirtualizerOptions: Expected.ReactVirtualizerOptions<HTMLDivElement, HTMLDivElement>;
	_resetIOSDetectionForTests: typeof Expected._resetIOSDetectionForTests;
	approxEqual: typeof Expected.approxEqual;
	debounce: typeof Expected.debounce;
	memo: typeof Expected.memo;
	notUndefined: typeof Expected.notUndefined;
	NoInfer: Expected.NoInfer<number>;
	PartialKeys: Expected.PartialKeys<{ count: number; label: string }, 'label'>;
	ScrollToOptions: Expected.ScrollToOptions;
	Range: Expected.Range;
	VirtualItem: Expected.VirtualItem;
	Rect: Expected.Rect;
	defaultKeyExtractor: typeof Expected.defaultKeyExtractor;
	defaultRangeExtractor: typeof Expected.defaultRangeExtractor;
	observeElementRect: typeof Expected.observeElementRect;
	observeWindowRect: typeof Expected.observeWindowRect;
	observeElementOffset: typeof Expected.observeElementOffset;
	observeWindowOffset: typeof Expected.observeWindowOffset;
	measureElement: typeof Expected.measureElement;
	windowScroll: typeof Expected.windowScroll;
	elementScroll: typeof Expected.elementScroll;
	VirtualizerOptions: Expected.VirtualizerOptions<HTMLDivElement, HTMLDivElement>;
	Virtualizer: typeof Expected.Virtualizer;
}
