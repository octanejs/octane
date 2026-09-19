import {
	act,
	createRoot,
	createElement,
	flushSync,
	hydrateRoot,
	Hydrate,
	Suspense,
	use,
	useId,
	useLayoutEffect,
	useState,
	type ComponentBody,
	type HydrateProps,
	type OctaneNode,
} from 'octane';

type Props = {
	when: HydrateProps['when'];
	prefetch?: HydrateProps['prefetch'];
	label: string;
	pending?: Promise<void>;
	fallback?: OctaneNode;
	onHydrated?: () => void;
	onEffect?: (phase: 'mount' | 'cleanup') => void;
	onClick?: (id: string) => void;
	onInput?: (event: Event) => void;
};

function Editor(props: Props) @{
	if (props.pending) use(props.pending);
	const id = useId();
	const [count, setCount] = useState(0);
	useLayoutEffect(() => {
		props.onEffect?.('mount');
		return () => props.onEffect?.('cleanup');
	}, []);
	<section id="split-template-editor" data-runtime-id={id}>
		<input id="split-template-draft" defaultValue="server draft" onInput={props.onInput} />
		<button
			id="split-template-action"
			onClick={() => {
				props.onClick?.(id);
				setCount(count + 1);
			}}
		>
			{props.label + ':' + count}
		</button>
	</section>
}

export function TemplateBoundary(props: Props) @{
	const _$__HydrateCompiled = 'authored';
	const sibling = useId();
	<main>
		<Hydrate when={props.when} prefetch={props.prefetch} onHydrated={props.onHydrated}>
			<Editor {...props} />
		</Hydrate>
		<span id="split-template-sibling">{_$__HydrateCompiled + ':' + sibling}</span>
	</main>
}

export function ClientPendingBoundary(props: Props) @{
	<Suspense fallback={<p id="split-outer-pending">{'Outer pending'}</p>}>
		<Hydrate when={props.when}>
			<Editor {...props} />
		</Hydrate>
	</Suspense>
}

export function ExplicitFallbackBoundary(props: Props) @{
	<Hydrate when={props.when} fallback={props.fallback}>
		<Editor {...props} />
	</Hydrate>
}

export function SpreadBoundary(props: Props & { boundary: Partial<HydrateProps> }) @{
	<Hydrate {...props.boundary} when={props.when}>
		<Editor {...props} />
	</Hydrate>
}

export function DescriptorBoundary(props: { when: HydrateProps['when']; children?: OctaneNode }) @{
	<Hydrate when={props.when} split={false} children={props.children} />
}

export function ShadowBoundary({
	Hydrate,
}: {
	Hydrate: (props: { children?: OctaneNode }) => string;
}) @{
	<Hydrate>
		<p>{'shadowed child'}</p>
	</Hydrate>
}

export function start(host: HTMLElement, name: string, props: Props, hydrate = false) {
	const views = {
		TemplateBoundary,
		ClientPendingBoundary,
		ExplicitFallbackBoundary,
		SpreadBoundary,
		DescriptorBoundary,
		ShadowBoundary,
	};
	const View = views[name as keyof typeof views] as ComponentBody<any>;
	const root =
		hydrate ? hydrateRoot(host, View, props) : createRoot(host);
	if (!hydrate) root.render(View, props);
	return {
		settle: () => act(() => {}),
		update: (next: Props) => act(() => root.render(View, next)),
		release: (complete: () => void) => act(complete),
		unmount: () => flushSync(() => root.unmount()),
	};
}

export async function descriptorControls(host: HTMLElement) {
	const root = createRoot(host);
	root.render(DescriptorBoundary, {
		when: (await import('octane/hydration')).load(),
		children: createElement('article', { children: 'descriptor' }),
	});
	await act(() => {});
	const descriptor = host.querySelector('article')!.textContent;
	flushSync(() => root.render(ShadowBoundary, { Hydrate: () => 'shadowed' }));
	const shadow = host.textContent;
	root.unmount();
	return { descriptor, shadow, cleaned: host.childNodes.length === 0 };
}
