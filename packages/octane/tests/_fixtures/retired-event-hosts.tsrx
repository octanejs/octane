import { useLayoutEffect } from 'octane';
import { useSignal$ } from 'octane/signals/client';

type Props = {
	readonly observe: (entry: string) => void;
	readonly restore: HTMLElement;
	readonly show?: boolean;
};

// A dialog-style focus restore: the deletion cleanup moves focus while the
// focused input is still attached, after its parent's signal scope retired.
function RestoreFocus({ restore }: Pick<Props, 'restore'>) @{
	useLayoutEffect(() => () => restore.focus(), []);
	<input />
}

export function SignalForm({ observe, restore }: Props) @{
	const count$ = useSignal$(0);
	<form
		onBlur={() => {
			observe('blur');
			count$.set(1);
			observe('write');
		}}
	>
		<RestoreFocus restore={restore} />
		<output>{count$.get() as number}</output>
	</form>
}

export function Toggle({ observe, restore, show }: Props) @{
	<section onBlur={() => observe('parent')}>
		@if (show) {
			<SignalForm observe={observe} restore={restore} />
		}
	</section>
}
