'use strong';

import { createContext, Hydrate, memo, type Context } from 'octane';
import type { HydrateWhen } from 'octane/hydration';
import type { WritableSignal } from 'octane/signals';
import { DeferredContent } from './native-condition-child.tsrx';
import 'octane/signals';

type GateValue = { open: boolean; revision: number };
interface BoundaryProps {
	context: Context<string>;
	ownerRevision: number;
	when: HydrateWhen;
	label: string;
	onHydrated?: () => void;
	onEffect?: () => void;
	onCleanup?: () => void;
	onClick?: () => void;
}
interface DemandProps extends Omit<BoundaryProps, 'context'> {
	eager$: WritableSignal<string>;
	gate$: WritableSignal<GateValue>;
	selector$?: WritableSignal<boolean>;
	alternative$?: WritableSignal<GateValue>;
	contextValue: string;
}

export const ProbeContext = createContext('closed');

function EagerSignal(props: {
	value$: WritableSignal<string>;
	gate$: WritableSignal<GateValue>;
	selector$?: WritableSignal<boolean>;
	alternative$?: WritableSignal<GateValue>;
}) @{
	const value = props.value$.get();
	const gate = props.gate$.get();
	const selection = props.selector$?.get();
	const alternative = props.alternative$?.get();
	<>
		<output id="eager-value">{value + String(gate.revision)}</output>
		@if (selection !== undefined && alternative !== undefined) {
			<output id="eager-alternative">
				{(selection ? 'alternative:' : 'gate:') + alternative.revision}
			</output>
		}
	</>
}

function Boundary(props: BoundaryProps) @{
	<section id="boundary-owner" data-revision={props.ownerRevision}>
		<Hydrate when={props.when} onHydrated={props.onHydrated}>
			<DeferredContent
				context={props.context}
				label={props.label}
				onEffect={props.onEffect}
				onCleanup={props.onCleanup}
				onClick={props.onClick}
			/>
		</Hydrate>
	</section>
}
const MemoBoundary = memo(Boundary);

export function NativeConditionDemand(props: DemandProps) @{
	<main>
		<EagerSignal
			value$={props.eager$}
			gate$={props.gate$}
			selector$={props.selector$}
			alternative$={props.alternative$}
		/>
		<ProbeContext value={props.contextValue}>
			<MemoBoundary
				context={ProbeContext}
				ownerRevision={props.ownerRevision}
				when={props.when}
				label={props.label}
				onHydrated={props.onHydrated}
				onEffect={props.onEffect}
				onCleanup={props.onCleanup}
				onClick={props.onClick}
			/>
		</ProbeContext>
	</main>
}
