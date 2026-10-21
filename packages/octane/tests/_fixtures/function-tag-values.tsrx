import { lazy, Suspense, ViewTransition } from 'octane';
import type { OctaneNode } from 'octane';

// Renderable values that need no element factory: text, numbers, arrays,
// empties. Nothing in this module builds an element descriptor, so these
// components render with only what compiled call sites install.

type ValueProps = { value: OctaneNode };

function settled<T>(value: T): PromiseLike<T> {
	return {
		then(resolve: (value: T) => void) {
			resolve(value);
		},
	} as PromiseLike<T>;
}

const ReturnsValue = lazy(() => settled({ default: (props: ValueProps) => props.value }));

export function LazyValue(props: ValueProps) @{
	<section>
		<ReturnsValue value={props.value} />
	</section>
}

let resolveSlow: ((module: { default: () => string }) => void) | null = null;

export function settleSlow(text: string): void {
	resolveSlow?.({ default: () => text });
}

const Slow = lazy(
	() =>
		new Promise<{ default: () => string }>((resolve) => {
			resolveSlow = resolve;
		}),
);

export function TextFallback() @{
	<main>
		<Suspense fallback="Loading">
			<Slow />
		</Suspense>
	</main>
}

export function TransitionValue(props: ValueProps) @{
	<article>
		<ViewTransition>{props.value}</ViewTransition>
	</article>
}
