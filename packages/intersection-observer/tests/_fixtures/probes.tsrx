import { InView, useInView, useOnInView } from '@octanejs/intersection-observer';

const noopEffect = () => {};

export function HookProbe(props: {
	onChange?(inView: boolean, entry: IntersectionObserverEntry): void;
	triggerOnce?: boolean;
	initialInView?: boolean;
}) @{
	const { ref, inView, entry } = useInView(props);
	<div ref={ref} data-testid="target" data-entry={entry ? 'yes' : 'no'}>
		{inView ? 'visible' : 'hidden'}
	</div>
}

export function EffectProbe(props: {
	onChange(inView: boolean, entry: IntersectionObserverEntry): void;
	threshold?: number;
	triggerOnce?: boolean;
}) @{
	const ref = useOnInView(props.onChange, {
		threshold: props.threshold,
		triggerOnce: props.triggerOnce,
	});
	<div ref={ref} data-testid="effect">effect</div>
}

export function EffectStaleCleanupProbe(props: {
	onChange(inView: boolean, entry: IntersectionObserverEntry): void;
	onReady?(attach: (node: Element | null) => void | (() => void)): void;
}) {
	const ref = useOnInView(props.onChange);
	props.onReady?.(ref);
	return <div data-testid="effect-stale">effect</div>;
}

export function EffectSwapProbe(props: {
	alternate: boolean;
	onChange(inView: boolean, entry: IntersectionObserverEntry): void;
}) {
	const ref = useOnInView(props.onChange);
	if (props.alternate) return <span ref={ref} data-testid="effect-swap">alternate</span>;
	return <div ref={ref} data-testid="effect-swap">initial</div>;
}

export function HookSwapProbe(props: {
	alternate: boolean;
	onChange(inView: boolean, entry: IntersectionObserverEntry): void;
}) {
	const { ref } = useInView({ onChange: props.onChange });
	if (props.alternate) return <span ref={ref} data-testid="hook-swap">alternate</span>;
	return <div ref={ref} data-testid="hook-swap">initial</div>;
}

export function EffectPoolProbe(
	props: {
		onFirst?: (inView: boolean, entry: IntersectionObserverEntry) => void;
		onSecond?: (inView: boolean, entry: IntersectionObserverEntry) => void;
	} = {},
) @{
	const first = useOnInView(props.onFirst ?? noopEffect, {
		threshold: 0.5,
		triggerOnce: true,
		initialInView: true,
	});
	const second = useOnInView(props.onSecond ?? noopEffect, {
		threshold: 0.5,
		triggerOnce: false,
		initialInView: false,
	});
	<>
		<div ref={first} data-testid="effect-first">first</div>
		<div ref={second} data-testid="effect-second">second</div>
	</>
}

export function ComponentProbe() @{
	<InView
		children={({ inView, ref }: { inView: boolean; ref(node: Element | null): void }) => <section
			ref={ref}
			data-testid="component"
		>
			{inView ? 'inside' : 'outside'}
		</section>}
	/>
}

export function PlainInViewProbe(props: {
	onChange?(inView: boolean, entry: IntersectionObserverEntry): void;
	triggerOnce?: boolean;
	hostRef?(node: Element | null): void;
}) @{
	<InView
		as="div"
		data-testid="plain-inview"
		onChange={props.onChange}
		triggerOnce={props.triggerOnce}
		ref={props.hostRef}
	>
		plain
	</InView>
}
