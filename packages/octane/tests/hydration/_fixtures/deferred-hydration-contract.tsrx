import { Hydrate, use } from 'octane';

function ContractButton(props) @{
	<button id={props.id} onClick={props.onClick}>
		{props.label as string}
	</button>
}

export function EarlyInteractionHydration(props) @{
	<Hydrate when={props.when} split={false} onHydrated={props.onHydrated}>
		<ContractButton id="early-interaction" label="Interact" onClick={props.onClick} />
	</Hydrate>
}

export function ProceduralPrefetchHydration(props) @{
	<Hydrate when={props.when} split={false} prefetch={props.prefetch} onHydrated={props.onHydrated}>
		<ContractButton id="procedural-prefetch" label="Prefetched" />
	</Hydrate>
}

function ActivationSuspendingChild(props) @{
	if (props.suspend) use(props.promise);
	<button id="activation-content">{'Server reviews'}</button>
}

export function ActivationSuspendingHydration(props) @{
	<Hydrate
		when={props.when}
		split={false}
		fallback={<span id="activation-fallback">{'Client fallback'}</span>}
		onHydrated={props.onHydrated}
	>
		<ActivationSuspendingChild suspend={props.suspend} promise={props.promise} />
	</Hydrate>
}
