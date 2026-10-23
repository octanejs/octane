import {
	ViewTransition,
	use,
	useDeferredValue,
	useOptimistic,
	useState,
	useTransition,
} from 'octane';

export interface TextCache {
	read(key: string): Promise<string>;
}

interface CounterProps {
	name: string;
	cache: TextCache;
}

function AsyncText(props: { cache: TextCache; text: string }) @{
	const text = use(props.cache.read(props.text));
	<span class="text">{text}</span>
}

// One transition per counter: each click increments its own queue inside its
// own startTransition, and renders text that suspends until the test resolves it.
function Counter(props: CounterProps) @{
	const [n, setN] = useState(0);
	const [optimistic, setOptimistic] = useOptimistic(String(n), (_: string, next: string) => next);
	const [isPending, start] = useTransition();
	<div class={props.name}>
		<button
			class="go"
			onClick={() =>
				start(() => {
					setOptimistic('saving');
					setN((x) => x + 1);
				})
			}
		>
			{'go'}
		</button>
		<span class="pending">{isPending ? 'pending' : 'idle'}</span>
		<span class="optimistic">{optimistic}</span>
		<AsyncText cache={props.cache} text={`${props.name}: ${n}`} />
	</div>
}

export function SeparateBoundaries(props: { cache: TextCache }) @{
	<main>
		@try {
			<Counter name="a" cache={props.cache} />
		} @pending {
			<span class="fallback-a">{'loading a'}</span>
		}
		@try {
			<Counter name="b" cache={props.cache} />
		} @pending {
			<span class="fallback-b">{'loading b'}</span>
		}
	</main>
}

export function SharedBoundary(props: { cache: TextCache }) @{
	<main>
		@try {
			<>
				<Counter name="a" cache={props.cache} />
				<Counter name="b" cache={props.cache} />
			</>
		} @pending {
			<span class="fallback">{'loading'}</span>
		}
	</main>
}

export function ViewTransitionBoundaries(props: { cache: TextCache }) @{
	<main>
		<ViewTransition>
			<section>
				@try {
					<Counter name="a" cache={props.cache} />
				} @pending {
					<span class="fallback-a">{'loading a'}</span>
				}
			</section>
		</ViewTransition>
		<ViewTransition>
			<section>
				@try {
					<Counter name="b" cache={props.cache} />
				} @pending {
					<span class="fallback-b">{'loading b'}</span>
				}
			</section>
		</ViewTransition>
	</main>
}

// A boundary whose content comes from root props: `root.render` in a transition
// folds no hook work, so its hold has no batch.
export function PropAndCounter(props: { cache: TextCache; text: string }) @{
	<main>
		@try {
			<div class="u">
				<AsyncText cache={props.cache} text={props.text} />
			</div>
		} @pending {
			<span class="fallback-u">{'loading u'}</span>
		}
		@try {
			<Counter name="b" cache={props.cache} />
		} @pending {
			<span class="fallback-b">{'loading b'}</span>
		}
	</main>
}

// ReactDeferredValue-test.js: the initial value and the deferred final value
// each suspend on a sibling, under a root with no Suspense boundary.
export function DeferredSiblings(props: { cache: TextCache }) @{
	const text = useDeferredValue('Final', 'Loading...');
	<>
		<AsyncText cache={props.cache} text={text} />{' '}
		<AsyncText cache={props.cache} text={`Sibling: ${text}`} />
	</>
}
