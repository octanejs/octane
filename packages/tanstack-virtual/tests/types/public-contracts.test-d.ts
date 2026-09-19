import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions.js';
import type { ExpectedContracts } from '../../typetests/expected-contracts';
import * as Actual from '@octanejs/tanstack-virtual';
type Contract_useVirtualizer = Assert<
	Equal<typeof Actual.useVirtualizer, ExpectedContracts['useVirtualizer']>
>;
type Contract_useWindowVirtualizer = Assert<
	Equal<typeof Actual.useWindowVirtualizer, ExpectedContracts['useWindowVirtualizer']>
>;
type Contract_ReactVirtualizer = Assert<
	Equal<
		Actual.ReactVirtualizer<HTMLDivElement, HTMLDivElement>,
		ExpectedContracts['ReactVirtualizer']
	>
>;
type Contract_ReactVirtualizerOptions = Assert<
	Equal<
		Actual.ReactVirtualizerOptions<HTMLDivElement, HTMLDivElement>,
		ExpectedContracts['ReactVirtualizerOptions']
	>
>;
type Contract__resetIOSDetectionForTests = Assert<
	Equal<typeof Actual._resetIOSDetectionForTests, ExpectedContracts['_resetIOSDetectionForTests']>
>;
type Contract_approxEqual = Assert<
	Equal<typeof Actual.approxEqual, ExpectedContracts['approxEqual']>
>;
type Contract_debounce = Assert<Equal<typeof Actual.debounce, ExpectedContracts['debounce']>>;
type Contract_memo = Assert<Equal<typeof Actual.memo, ExpectedContracts['memo']>>;
type Contract_notUndefined = Assert<
	Equal<typeof Actual.notUndefined, ExpectedContracts['notUndefined']>
>;
type Contract_NoInfer = Assert<Equal<Actual.NoInfer<number>, ExpectedContracts['NoInfer']>>;
type Contract_PartialKeys = Assert<
	Equal<
		Actual.PartialKeys<{ count: number; label: string }, 'label'>,
		ExpectedContracts['PartialKeys']
	>
>;
type Contract_ScrollToOptions = Assert<
	Equal<Actual.ScrollToOptions, ExpectedContracts['ScrollToOptions']>
>;
type Contract_Range = Assert<Equal<Actual.Range, ExpectedContracts['Range']>>;
type Contract_VirtualItem = Assert<Equal<Actual.VirtualItem, ExpectedContracts['VirtualItem']>>;
type Contract_Rect = Assert<Equal<Actual.Rect, ExpectedContracts['Rect']>>;
type Contract_defaultKeyExtractor = Assert<
	Equal<typeof Actual.defaultKeyExtractor, ExpectedContracts['defaultKeyExtractor']>
>;
type Contract_defaultRangeExtractor = Assert<
	Equal<typeof Actual.defaultRangeExtractor, ExpectedContracts['defaultRangeExtractor']>
>;
type Contract_observeElementRect = Assert<
	Equal<typeof Actual.observeElementRect, ExpectedContracts['observeElementRect']>
>;
type Contract_observeWindowRect = Assert<
	Equal<typeof Actual.observeWindowRect, ExpectedContracts['observeWindowRect']>
>;
type Contract_observeElementOffset = Assert<
	Equal<typeof Actual.observeElementOffset, ExpectedContracts['observeElementOffset']>
>;
type Contract_observeWindowOffset = Assert<
	Equal<typeof Actual.observeWindowOffset, ExpectedContracts['observeWindowOffset']>
>;
type Contract_measureElement = Assert<
	Equal<typeof Actual.measureElement, ExpectedContracts['measureElement']>
>;
type Contract_windowScroll = Assert<
	Equal<typeof Actual.windowScroll, ExpectedContracts['windowScroll']>
>;
type Contract_elementScroll = Assert<
	Equal<typeof Actual.elementScroll, ExpectedContracts['elementScroll']>
>;
type Contract_VirtualizerOptions = Assert<
	Equal<
		Actual.VirtualizerOptions<HTMLDivElement, HTMLDivElement>,
		ExpectedContracts['VirtualizerOptions']
	>
>;
type Contract_Virtualizer = Assert<
	Equal<typeof Actual.Virtualizer, ExpectedContracts['Virtualizer']>
>;
const virtualizer = Actual.useVirtualizer<HTMLDivElement, HTMLDivElement>({
	count: 100,
	getScrollElement: () => document.createElement('div'),
	estimateSize: () => 40,
	useCachedMeasurements: true,
	directDomUpdates: true,
	directDomUpdatesMode: 'position',
});
virtualizer.containerRef(document.createElement('div'));
virtualizer.containerRef(null);
// @ts-expect-error the container ref accepts an HTML element, not Window
virtualizer.containerRef(window);
// @ts-expect-error count is required
Actual.useVirtualizer({
	getScrollElement: () => document.createElement('div'),
	estimateSize: () => 40,
});
Actual.useVirtualizer({
	count: 100,
	getScrollElement: () => document.createElement('div'),
	estimateSize: () => 40,
	// @ts-expect-error cached measurements is a boolean option
	useCachedMeasurements: 'yes',
});
Actual.useVirtualizer({
	count: 100,
	getScrollElement: () => document.createElement('div'),
	estimateSize: () => 40,
	// @ts-expect-error only the two public positioning modes are accepted
	directDomUpdatesMode: 'grid',
});
