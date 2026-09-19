import {
	createContext,
	Hydrate,
	Suspense,
	use,
	useContext,
	useId,
	useLayoutEffect,
	useState,
	type HydrateProps,
} from 'octane';
import type { SignalHandle } from 'octane/signals';

type Value = string | SignalHandle<string>;
const Theme = createContext<Value>('default');

type Props = {
	when: HydrateProps['when'];
	prefetch?: HydrateProps['prefetch'];
	value: Value;
	outer?: string;
	pending?: Promise<void>;
	onEffect?: (phase: 'mount' | 'cleanup') => void;
	onHydrated?: () => void;
	onPending?: () => void;
};

function Reader() @{
	const value = useContext(Theme);
	<p class="split-context-eager">{value as string}</p>
}

function Editor(props: Props) @{
	if (props.pending) {
		props.onPending?.();
		use(props.pending);
	}
	const value = useContext(Theme);
	const id = useId();
	const [count, setCount] = useState(0);
	useLayoutEffect(() => {
		props.onEffect?.('mount');
		return () => props.onEffect?.('cleanup');
	}, []);
	<section id="split-context-editor" data-runtime-id={id}>
		<span id="split-context-value" title={value}>{value as string}</span>
		<input id="split-context-draft" defaultValue="server draft" />
		<button id="split-context-action" onClick={() => setCount(count + 1)}>{String(
			count,
		) as string}</button>
	</section>
}

export function App(props: Props) @{
	<main>
		<Reader />
		<Theme value={props.outer ?? 'outer'}>
			<Reader />
		</Theme>
		<Hydrate when={props.when} prefetch={props.prefetch} onHydrated={props.onHydrated}>
			<Theme value={props.value}>
				<Editor {...props} />
			</Theme>
		</Hydrate>
	</main>
}

export function Pending(props: Props) @{
	<Suspense fallback={<p id="split-context-pending">{'pending'}</p>}>
		<Hydrate when={props.when} prefetch={props.prefetch}>
			<Theme value={props.value}>
				<Editor {...props} />
			</Theme>
		</Hydrate>
	</Suspense>
}

export function Nested(props: Props) @{
	<main>
		<Hydrate when={props.when}>
			<Theme value={props.value}>
				<Reader />
				<Hydrate when={props.when}>
					<Theme value="inner">
						<Reader />
					</Theme>
				</Hydrate>
				<Reader />
			</Theme>
		</Hydrate>
		<Hydrate when={props.when}>
			<Theme value="sibling">
				<Reader />
			</Theme>
		</Hydrate>
	</main>
}
