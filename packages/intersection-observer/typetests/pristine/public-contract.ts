import * as O from 'react-intersection-observer';
import * as M from 'react-intersection-observer/test-utils';
import type { ReactNode as OctaneNode } from 'react';
import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions';

type Change = (inView: boolean, entry: IntersectionObserverEntry) => void;
type CleanupRef = (node?: Element | null) => void;
type ExpectedHook = [CleanupRef, boolean, IntersectionObserverEntry | undefined] & {
	ref: CleanupRef;
	inView: boolean;
	entry?: IntersectionObserverEntry;
};
type ExpectedRenderProps = {
	inView: boolean;
	entry: IntersectionObserverEntry | undefined;
	ref: CleanupRef;
};

type InView = Assert<
	Equal<ConstructorParameters<typeof O.InView>[0]['triggerOnce'], boolean | undefined>
>;
type Hook = Assert<Equal<ReturnType<typeof O.useInView>, ExpectedHook>>;
type EffectHook = Assert<
	Equal<
		ReturnType<typeof O.useOnInView<HTMLButtonElement>>,
		(node: HTMLButtonElement | null | undefined) => (() => void) | undefined
	>
>;
type Observe = Assert<Equal<ReturnType<typeof O.observe>, () => void>>;
type Fallback = Assert<Equal<Parameters<typeof O.defaultFallbackInView>, [boolean | undefined]>>;
type HookResponse = Assert<Equal<O.InViewHookResponse, ExpectedHook>>;
type Callback = Assert<Equal<O.ObserverInstanceCallback, Change>>;
type Effect = Assert<
	Equal<
		O.IntersectionChangeEffect<HTMLButtonElement>,
		(inView: boolean, entry: IntersectionObserverEntry & { target: HTMLButtonElement }) => void
	>
>;
type Options = Assert<Equal<O.IntersectionOptions['onChange'], Change | undefined>>;
type EffectOptions = Assert<
	Equal<O.IntersectionEffectOptions['threshold'], number | number[] | undefined>
>;
type InitOptions = Assert<
	Equal<O.IntersectionObserverInitWithOptions['root'], Element | Document | null | undefined>
>;
type PlainProps = Assert<
	Equal<
		Parameters<NonNullable<O.PlainChildrenProps['onChange']>>,
		[boolean, IntersectionObserverEntry]
	>
>;
type ComponentProps = Assert<
	Equal<Parameters<O.IntersectionObserverProps['children']>[0]['inView'], boolean>
>;
type Setup = Assert<Equal<ReturnType<typeof M.setupIntersectionMocking>, void>>;
type Reset = Assert<Equal<typeof M.resetIntersectionMocking, () => void>>;
type Destroy = Assert<Equal<typeof M.destroyIntersectionMocking, () => void>>;
type All = Assert<Equal<typeof M.mockAllIsIntersecting, (visible: boolean | number) => void>>;
type One = Assert<
	Equal<typeof M.mockIsIntersecting, (element: Element, visible: boolean | number) => void>
>;
type Instance = Assert<
	Equal<typeof M.intersectionMockInstance, (element: Element) => IntersectionObserver>
>;

declare const target: HTMLButtonElement;
const result = O.useInView({ threshold: [0.25, 0.75], triggerOnce: true, scrollMargin: '8px' });
const stop = result.ref(target);

O.useOnInView<HTMLButtonElement>((visible, entry) => {
	const button: HTMLButtonElement = entry.target;
	button.disabled = !visible;
})(target)?.();
O.observe(target, (visible, entry) => {
	target.hidden = !visible && entry.target === target;
})();
O.defaultFallbackInView(false);
M.mockAllIsIntersecting(0.5);
M.mockIsIntersecting(target, true);
M.intersectionMockInstance(target).unobserve(target);
// @ts-expect-error targets must be elements
O.observe('invalid', () => {});
// @ts-expect-error effect-only hooks do not own initial visibility
O.useOnInView(() => {}, { initialInView: true });
// @ts-expect-error the generic target stays a button
O.useOnInView<HTMLButtonElement>(() => {})(document.createElement('div'));
// @ts-expect-error mock visibility accepts a boolean or number
M.mockAllIsIntersecting('visible');
