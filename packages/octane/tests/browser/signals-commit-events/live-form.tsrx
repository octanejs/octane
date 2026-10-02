import type { SignalHandle, WritableSignal } from 'octane/signals';
import { useSignal$ } from 'octane/signals/client';

export interface LiveFormProps {
	/** Spread onto the first input, so a re-render can disable it mid-patch. */
	attributes: Record<string, unknown>;
	showInput: boolean;
	/** Read only by the listeners, never by the render. */
	unrelated$: SignalHandle<number>;
	/** Written by every listener; its subscribers run when the event's batch closes. */
	events$: WritableSignal<number>;
	fail: boolean;
	observe(entry: string): void;
}

export function LiveForm(props: LiveFormProps) @{
	const blurs$ = useSignal$(0);
	const listen = (entry: string, blurred: boolean): void => {
		props.observe(entry);
		props.unrelated$.get();
		// Blur listeners also write the local state this component renders.
		if (blurred) blurs$.set(blurs$.get() + 1);
		props.events$.set((count) => count + 1);
		props.observe(entry + '-write');
		if (props.fail && entry === 'blur') throw new Error('listener failed');
	};
	props.observe('render');
	<form
		onBlurCapture={() => listen('blur-capture', true)}
		onBlur={() => listen('blur', true)}
		onFocus={() => listen('focus', false)}
	>
		@if (props.showInput) {
			props.observe('render');
			<input aria-label="Draft" {...props.attributes} />
		}
		<input aria-label="Next" />
		<output>{String(blurs$.get())}</output>
	</form>
}
