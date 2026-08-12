import type { OctaneNode } from 'octane';

export interface IntersectionObserverInitWithOptions extends IntersectionObserverInit {
	scrollMargin?: string;
	trackVisibility?: boolean;
	delay?: number;
}

export type ObserverInstanceCallback = (inView: boolean, entry: IntersectionObserverEntry) => void;

export type IntersectionChangeEffect = (inView: boolean, entry: IntersectionObserverEntry) => void;

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
	ref: (node: Element | null) => void;
};

export type InViewProps = IntersectionOptions & {
	children: ((props: InViewRenderProps) => OctaneNode) | OctaneNode;
	as?: string;
	[key: string]: unknown;
};

export type InViewHookResponse = [
	(node: Element | null) => void,
	boolean,
	IntersectionObserverEntry | undefined,
] & {
	ref: (node: Element | null) => void;
	inView: boolean;
	entry?: IntersectionObserverEntry;
};

export type IntersectionEffectOptions = Omit<
	IntersectionOptions,
	'onChange' | 'fallbackInView' | 'initialInView'
>;
