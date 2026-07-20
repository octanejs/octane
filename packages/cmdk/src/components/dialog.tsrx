// Command.Dialog. Renders the command menu inside an @octanejs/radix Dialog.
// Built with createElement rather than JSX children: radix's Dialog.Portal
// iterates its children via Children.map, which needs real element descriptors —
// octane's compiled .tsrx children would be opaque (the documented radix
// asChild/Slot divergence). The overlay + content are passed as descriptor
// children.
import { createElement } from 'octane';
import { Dialog as RadixDialog } from '@octanejs/radix';
import { CommandRoot } from './command.tsrx';
import type { DialogProps } from '../types';

export function Dialog(props: DialogProps) {
	const {
		open,
		defaultOpen,
		onOpenChange,
		modal,
		overlayClassName,
		contentClassName,
		container,
		label,
		ref: _ref,
		...etc
	} = props;

	return createElement(
		RadixDialog.Root,
		{ open, defaultOpen, onOpenChange, modal },
		createElement(
			RadixDialog.Portal,
			{ container },
			createElement(RadixDialog.Overlay, { 'cmdk-overlay': '', className: overlayClassName }),
			createElement(
				RadixDialog.Content,
				{ 'aria-label': label, 'cmdk-dialog': '', className: contentClassName },
				createElement(CommandRoot, { ref: props.ref, label, ...etc }),
			),
		),
	);
}
