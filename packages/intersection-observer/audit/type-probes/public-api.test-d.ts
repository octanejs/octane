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

declare const target: HTMLButtonElement;
const hook = useInView({ threshold: [0.25, 0.75], scrollMargin: '8px', triggerOnce: true });
expectType<boolean>(hook.inView);
expectType<IntersectionObserverEntry | undefined>(hook.entry);
expectType<(node: Element | null) => void>(hook.ref);
expectType<() => void>(
	observe(target, (visible, entry) => {
		expectType<boolean>(visible);
		expectType<Element>(entry.target);
	}),
);
useOnInView<HTMLButtonElement>((visible, entry) => {
	expectType<boolean>(visible);
	expectType<HTMLButtonElement>(entry.target);
})(target);
const response: InViewHookResponse = hook;
const options: IntersectionOptions = {
	onChange: (visible, entry) => {
		expectType<boolean>(visible);
		expectType<IntersectionObserverEntry>(entry);
	},
};
const callback: ObserverInstanceCallback = (visible, entry) => {
	target.hidden = !visible && entry.target === target;
};
void response;
void options;
void callback;
void InView;

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
