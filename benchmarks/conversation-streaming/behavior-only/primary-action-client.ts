import { attachPrimaryAction } from './primary-action-manual.ts';
import { createPrimaryActionSource, initialPrimaryAction } from './primary-action-state.ts';

export function initializePrimaryAction() {
	const root = document.getElementById('primary-action')!;
	const form = document.getElementById('primary-action-form') as HTMLFormElement;
	const source = createPrimaryActionSource();
	const lifetime = new AbortController();
	const binding = attachPrimaryAction(root, source, lifetime.signal);
	const submit = (event: SubmitEvent) => {
		event.preventDefault();
		document.documentElement.dataset.primaryActionSubmitted = String(event.submitter === root);
	};
	form.addEventListener('submit', submit);
	const update = (event: Event) => {
		const {
			active,
			disabled = false,
			stopRequested = false,
			defer = false,
		} = (event as CustomEvent).detail;
		source.publish(
			{
				...initialPrimaryAction,
				active,
				disabled,
				stopRequested,
				visuallyDisabled: disabled,
				type: active ? 'button' : 'submit',
				label: active ? 'Stop generating' : 'Send message',
				tone: active ? 'red' : 'black',
			},
			!defer,
		);
		// An explicit refresh must also work before the surrounding state source
		// publishes its batch. Native requestSubmit observes this same stack.
		if (defer) binding.refresh();
	};
	root.addEventListener('primary-action-update', update);
	const dispose = () => {
		lifetime.abort();
		root.removeEventListener('primary-action-update', update);
		form.removeEventListener('submit', submit);
	};
	root.addEventListener('primary-action-dispose', dispose, { once: true });
	return dispose;
}
