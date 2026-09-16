import type { PrimaryActionSource } from './primary-action-state.ts';

// Matched imperative view control. The native commands and state source are shared
// with the authored variant; only this subscribe-to-DOM projection is substituted.
export function attachPrimaryAction(
	root: Element,
	source: PrimaryActionSource,
	signal: AbortSignal,
) {
	const button = root as HTMLButtonElement;
	const send = button.querySelector('[data-send-icon]') as HTMLElement;
	const stop = button.querySelector('[data-stop-icon]') as HTMLElement;
	let disposed = false;
	const refresh = () => {
		if (disposed) return;
		const snapshot = source.getSnapshot();
		button.type = snapshot.type;
		button.disabled = snapshot.disabled;
		button.setAttribute('aria-disabled', String(snapshot.visuallyDisabled));
		button.setAttribute('aria-label', snapshot.label);
		button.toggleAttribute('data-stop-generating', snapshot.stopRequested);
		button.toggleAttribute('data-visually-disabled', snapshot.visuallyDisabled);
		button.className = `primary-action ${snapshot.active ? 'active' : 'ready'}`;
		button.style.opacity = String(snapshot.visuallyDisabled ? 0.5 : 1);
		button.style.setProperty('--action-tone', snapshot.tone);
		send.hidden = snapshot.active;
		stop.hidden = !snapshot.active;
	};
	const unsubscribe = signal.aborted ? () => {} : source.subscribe(refresh);
	const dispose = () => {
		if (disposed) return;
		disposed = true;
		unsubscribe();
		signal.removeEventListener('abort', dispose);
	};
	if (signal.aborted) dispose();
	else {
		signal.addEventListener('abort', dispose, { once: true });
		refresh();
	}
	return { refresh, dispose };
}
