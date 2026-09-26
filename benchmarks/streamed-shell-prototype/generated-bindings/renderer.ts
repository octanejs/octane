import { flushSync, hydrateRoot } from 'octane';
import type { BindingSource } from 'octane/behavior';
import { ConversationStatus } from './View.tsrx';
import { transfer } from './transfer.ts';
import { initial } from './initial.ts';

type Props = Parameters<typeof ConversationStatus>[0];
export function activate(slot: Element, source: BindingSource<Props>, signal: AbortSignal) {
	if (signal.aborted) return { refresh() {}, dispose() {} };
	// Transfer only the exact, host-owned pair. Unknown boundaries are left
	// to the ordinary renderer's recoverable mismatch behavior.
	transfer(slot);
	const root = hydrateRoot(slot, ConversationStatus, initial, {
		onRecoverableError(error) {
			window.__automaticErrors.push(String(error));
		},
	});
	const refresh = () => flushSync(() => root.render(ConversationStatus, source.getSnapshot()));
	const unsubscribe = source.subscribe(refresh);
	refresh();
	let disposed = false;
	const dispose = () => {
		if (disposed) return;
		disposed = true;
		unsubscribe();
		root.unmount();
	};
	signal.addEventListener('abort', dispose, { once: true });
	if (signal.aborted) dispose();
	return { refresh, dispose };
}
