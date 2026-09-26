import { adoptBindings, type BindingSource } from 'octane/behavior';
import { ConversationStatus } from './View.tsrx';

export function activate(
	root: Element,
	source: BindingSource<Parameters<typeof ConversationStatus>[0]>,
	signal: AbortSignal,
) {
	return adoptBindings(root, ConversationStatus, source, { signal });
}
