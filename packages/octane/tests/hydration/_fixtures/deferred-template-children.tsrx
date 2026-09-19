import {
	Hydrate,
	Suspense,
	use,
	useId,
	useLayoutEffect,
	useState,
	type HydrateProps,
	type OctaneNode,
} from 'octane';

type EditorProps = {
	pending?: Promise<void>;
	label: string;
	onEffect?: (phase: 'mount' | 'cleanup') => void;
	onClick?: (id: string) => void;
	onInput?: (event: Event) => void;
};
type TemplateProps = EditorProps & { when: HydrateProps['when']; onHydrated?: () => void };

function Editor(props: EditorProps) @{
	if (props.pending) use(props.pending);
	const id = useId();
	const [count, setCount] = useState(0);
	useLayoutEffect(() => {
		props.onEffect?.('mount');
		return () => props.onEffect?.('cleanup');
	}, []);
	<section id="template-editor" data-runtime-id={id}>
		<input id="template-draft" defaultValue="server draft" onInput={props.onInput} />
		<button
			id="template-action"
			onClick={() => {
				props.onClick?.(id);
				setCount(count + 1);
			}}
		>
			{props.label + ':' + count}
		</button>
	</section>
}

export function TemplateBoundary(props: TemplateProps) @{
	const _$__HydrateCompiled = 'authored';
	const siblingId = useId();
	<main>
		<Hydrate when={props.when} split={false} onHydrated={props.onHydrated}>
			<Editor {...props} />
		</Hydrate>
		<span id="template-sibling">{_$__HydrateCompiled + ':' + siblingId}</span>
	</main>
}

export function ClientPendingBoundary(props: TemplateProps) @{
	<Suspense fallback={<p id="outer-pending">{'Outer pending'}</p>}>
		<Hydrate when={props.when} split={false}>
			<Editor {...props} />
		</Hydrate>
	</Suspense>
}

export function ExplicitFallbackBoundary(props: TemplateProps & { fallback?: OctaneNode }) @{
	<Hydrate when={props.when} split={false} fallback={props.fallback}>
		<Editor {...props} />
	</Hydrate>
}

export function SpreadBoundary(props: EditorProps & {
	boundary: Pick<HydrateProps, 'when' | 'fallback'>;
}) @{
	<Hydrate {...props.boundary} split={false}>
		<Editor {...props} />
	</Hydrate>
}

export function DescriptorBoundary(props: { when: HydrateProps['when']; children?: OctaneNode }) @{
	<Hydrate when={props.when} split={false} children={props.children} />
}

export function ShadowBoundary({
	Hydrate,
}: {
	Hydrate: (props: { split: boolean; children?: OctaneNode }) => string;
}) @{
	<Hydrate split={false}>
		<p>{'Child'}</p>
	</Hydrate>
}

export function SplitBoundary(props: Pick<TemplateProps, 'when' | 'label' | 'onHydrated'>) @{
	<Hydrate when={props.when} onHydrated={props.onHydrated}>
		<Editor label={props.label} />
	</Hydrate>
}
