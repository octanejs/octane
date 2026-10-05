import { ViewTransition } from 'octane';
import {
	captureSignalOwner,
	currentSignalOwner,
	derived$,
	type SignalHandle,
	type WritableSignal,
} from 'octane/signals';

export interface PromotionResource {
	tracked: boolean;
	ready: boolean;
	ready$: WritableSignal<boolean>;
	waiting: Promise<void>;
}

export interface PromotionProps {
	resource: PromotionResource;
	version: number;
	capture(value$: Pick<SignalHandle<string>, 'get' | 'snapshot'>): void;
}

function PendingChild(props: PromotionProps) @{
	const value$ = derived$(({ read }) => {
		void read;
		const ready =
			props.resource.tracked ? props.resource.ready$.get() : props.resource.ready;
		if (!ready) throw props.resource.waiting;
		return 'ready:' + props.version;
	});
	const status = value$.snapshot().status;
	const run = captureSignalOwner(currentSignalOwner()!);
	<button
		onClick={() => props.capture({
			get: () => run(() => value$.get()),
			snapshot: () => run(() => value$.snapshot()),
		})}
	>
		{props.version === 0 ? 'Short' : 'Much longer content here'}
		<span>{status}</span>
	</button>
}

export function PendingPromotion(props: PromotionProps) @{
	<ViewTransition update="auto">
		<div>
			<PendingChild {...props} />
		</div>
	</ViewTransition>
}
