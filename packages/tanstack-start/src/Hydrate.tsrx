// Hydrate — port of @tanstack/react-start-client's Hydrate.tsx (partial
// hydration entry point). `props.when` carries a hydration strategy created by
// the `@octanejs/tanstack-start/hydration` factories; each strategy brings its
// own renderer (`_h`), so `Hydrate` delegates to it. A function-valued `when`
// picks the strategy on the client only; on the server it renders the generic
// `dynamic` marker so the streamed HTML stays strategy-agnostic.
//
// OCTANE ADAPTATION: upstream invokes the renderer inline as a method call
// (`props.when._h(props)` — the renderer's hooks run on Hydrate's own fiber
// and it reads the strategy off `this`). Octane's compiled components use the
// `(props, __s, __extra)` ABI and cannot be bare-called, so `_h` is rendered
// as a child COMPONENT here instead, and renderers that need their strategy
// derive it from `props.when` (resolving function-valued `when`, exactly as
// upstream's Hydrate does per render). Same DOM, markers, and effects; the
// renderer's hooks live in their own component scope rather than Hydrate's.
import { Suspense, useId } from 'octane';
import type { OctaneNode } from 'octane';
import { isServer } from '@tanstack/router-core/isServer';
import {
	hydrateIdAttribute,
	hydrateWhenAttribute,
} from '@tanstack/start-client-core/hydration/constants';
import type {
	HydrationStrategy as CoreHydrationStrategy,
	HydrationPrefetchFunction,
	HydrationPrefetchStrategy,
	HydrationWhen,
} from '@tanstack/start-client-core/hydration';

export type OctaneHydrationStrategy<
	TWhen extends HydrationWhen = HydrationWhen,
	TCanPrefetch extends boolean = boolean,
> =
	CoreHydrationStrategy<TWhen, TCanPrefetch> & {
		_h: (props: HydrateProps) => OctaneNode;
	};

export type HydrationStrategy<
	TWhen extends HydrationWhen = HydrationWhen,
	TCanPrefetch extends boolean = boolean,
> =
	OctaneHydrationStrategy<TWhen, TCanPrefetch>;

export type HydrateWhen = OctaneHydrationStrategy | (() => OctaneHydrationStrategy);

type HydrateCommonOptions = {
	when: HydrateWhen;
	fallback?: OctaneNode;
	onHydrated?: () => void;
};

export type HydrateOptions =
	| (HydrateCommonOptions & {
			prefetch?: never;
			split?: boolean;
	  })
	| (HydrateCommonOptions & {
			prefetch: HydrationPrefetchStrategy;
			split?: true;
	  })
	| (HydrateCommonOptions & {
			prefetch: HydrationPrefetchFunction;
			split?: boolean;
	  });

export type HydrateProps =
	HydrateOptions & {
		children: OctaneNode;
	};

export type InternalHydrateProps =
	HydrateProps & {
		h?: string;
		p?: () => Promise<void>;
	};

const dynamicType = 'dynamic';

function ServerDynamicHydrate(props: HydrateProps) @{
	const internalProps = props as InternalHydrateProps;
	const octaneId = useId();
	const id = internalProps.h ? `${internalProps.h}${octaneId}` : octaneId;

	<div
		{...{
			[hydrateIdAttribute]: id,
			[hydrateWhenAttribute]: dynamicType,
		}}
	>
		<Suspense fallback={props.fallback ?? null}>{props.children}</Suspense>
	</div>
}

export function Hydrate(props: HydrateProps) {
	if (typeof props.when === 'function') {
		if (isServer ?? typeof window === 'undefined') {
			return <ServerDynamicHydrate {...props} />;
		}

		const DynamicRenderer = props.when()._h;
		return <DynamicRenderer {...props} />;
	}

	const Renderer = props.when._h;
	return <Renderer {...props} />;
}
