import type { Octane, OctaneNode } from 'octane';

export interface IntersectionObserverInitWithOptions extends IntersectionObserverInit {
	scrollMargin?: string;
	trackVisibility?: boolean;
	delay?: number;
}

export type ObserverInstanceCallback = (inView: boolean, entry: IntersectionObserverEntry) => void;

export type IntersectionChangeEffect<TElement extends Element = Element> = (
	inView: boolean,
	entry: IntersectionObserverEntry & { target: TElement },
) => void;

export interface IntersectionOptions extends IntersectionObserverInitWithOptions {
	triggerOnce?: boolean;
	skip?: boolean;
	initialInView?: boolean;
	fallbackInView?: boolean;
	onChange?: ObserverInstanceCallback;
}

export type InViewRenderProps = {
	inView: boolean;
	entry: IntersectionObserverEntry | undefined;
	ref: (node?: Element | null) => (() => void) | undefined;
};

export interface IntersectionObserverProps extends IntersectionOptions {
	children: (props: InViewRenderProps) => OctaneNode;
}

export type PlainChildrenProps = IntersectionOptions & {
	children?: OctaneNode;
	as?: string;
} & Omit<Octane.HTMLAttributes<HTMLElement>, 'onChange' | 'children'>;

export type InViewProps = IntersectionOptions & {
	children?: ((props: InViewRenderProps) => OctaneNode) | OctaneNode;
	as?: string;
	[key: string]: unknown;
};

export type InViewHookResponse = [
	(node?: Element | null) => (() => void) | undefined,
	boolean,
	IntersectionObserverEntry | undefined,
] & {
	ref: (node?: Element | null) => (() => void) | undefined;
	inView: boolean;
	entry?: IntersectionObserverEntry;
};

export type IntersectionEffectOptions = Omit<
	IntersectionOptions,
	'onChange' | 'fallbackInView' | 'initialInView'
>;
