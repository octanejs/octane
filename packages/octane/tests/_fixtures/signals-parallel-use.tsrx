import { use } from 'octane';

export interface NativeCreationProps {
	make$: () => Promise<string>;
	label?: string;
}

export function NativeCreationValue(props: NativeCreationProps) @{
	const value = use(props.make$());
	<p class="creation-value">{value as string}</p>
}

export function NativeCreationBoundary(props: NativeCreationProps) @{
	<section>
		<span class="label">{props.label ?? ''}</span>
		@try {
			<NativeCreationValue make$={props.make$} />
		} @pending {
			<p class="pending">{'loading'}</p>
		}
	</section>
}

export function NativeWarmParent(props: NativeCreationProps & { gate: () => Promise<string> }) @{
	const parent = use(props.gate());
	<section>
		<p class="parent-value">{parent as string}</p>
		<NativeCreationValue make$={props.make$} />
	</section>
}

export function NativeWarmBoundary(props: NativeCreationProps & { gate: () => Promise<string> }) @{
	<>
		@try {
			<NativeWarmParent make$={props.make$} gate={props.gate} />
		} @pending {
			<p class="pending">{'loading'}</p>
		}
	</>
}
