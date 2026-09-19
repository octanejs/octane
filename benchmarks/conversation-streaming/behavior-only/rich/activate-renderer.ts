import { createRoot, flushSync, hydrateRoot } from 'octane';
import type { BindingSource } from 'octane/behavior';
import { RichConversation, type RichConversationProps } from './RichConversation.tsrx';

/** Explicit equal-work control; this entry deliberately loads the full renderer. */
export function activate(
	slot: Element,
	source: BindingSource<RichConversationProps>,
	signal: AbortSignal,
	existing: boolean,
) {
	const root = existing
		? hydrateRoot(slot, RichConversation, source.getSnapshot())
		: createRoot(slot);
	const refresh = () => flushSync(() => root.render(RichConversation, source.getSnapshot()));
	if (!existing) refresh();
	const unsubscribe = source.subscribe(refresh);
	let disposed = false;
	const dispose = () => {
		if (disposed) return;
		disposed = true;
		unsubscribe();
		root.unmount();
	};
	signal.addEventListener('abort', dispose, { once: true });
	return { refresh, dispose };
}
