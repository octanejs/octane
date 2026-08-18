import type {
	InViewHookResponse,
	IntersectionOptions,
	ObserverInstanceCallback,
} from '../../upstream/src/index';
import {
	InView,
	defaultFallbackInView,
	observe,
	useInView,
	useOnInView,
} from '../../upstream/src/index';

declare function expectType<T>(value: T): void;

expectType<typeof InView>(InView);
expectType<typeof useInView>(useInView);
expectType<typeof useOnInView>(useOnInView);
expectType<typeof observe>(observe);
expectType<typeof defaultFallbackInView>(defaultFallbackInView);

type HookResponse = InViewHookResponse;
expectType<HookResponse>(null as unknown as HookResponse);

type Options = IntersectionOptions;
expectType<Options>(null as unknown as Options);

type Change = ObserverInstanceCallback;
expectType<Change>(null as unknown as Change);

// @ts-expect-error observe requires an Element target
observe(null, function noop() {});

// @ts-expect-error useInView options reject unknown keys
useInView({ notARealOption: true });

// @ts-expect-error defaultFallbackInView rejects non-boolean non-undefined values
defaultFallbackInView('yes');

// @ts-expect-error useOnInView options omit initialInView
useOnInView(function noop() {}, { initialInView: true });

// @ts-expect-error useOnInView options omit fallbackInView
useOnInView(function noop() {}, { fallbackInView: true });
