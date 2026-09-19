import { adoptBindings, mountBindings, type BindingSource } from 'octane/behavior';
import { RichConversation, type RichConversationProps } from './RichConversation.tsrx';

export function activate(
	slot: Element,
	source: BindingSource<RichConversationProps>,
	signal: AbortSignal,
	existing: boolean,
) {
	return existing
		? adoptBindings(slot.querySelector('[data-rich]')!, RichConversation, source, { signal })
		: mountBindings({ parent: slot }, RichConversation, source, { signal });
}
