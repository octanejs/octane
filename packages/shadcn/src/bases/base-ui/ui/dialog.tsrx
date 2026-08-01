// Base UI base dialog — runs on @octanejs/base-ui's Dialog.
// Part mapping: Overlay -> Backdrop, Content -> Popup, and the close affordance composes a
// Button through Base UI's render-as-ELEMENT contract rather than radix's `asChild`.
//
// `data-open:`/`data-closed:` need no adaptation — the radix base already uses that exact form
// and Base UI emits the same attributes.
//
// Drops upstream's `cn-font-heading` on the title, matching the react-aria base and this base's
// alert-dialog: the package ships the utilities-inlined flavor and nothing defines that hook.
//
// UNVERIFIED PROVENANCE: class strings come from this package's radix base rather than
// transcribed from upstream's Base UI source.
import { createElement, type OctaneNode } from 'octane';
import { Dialog as DialogPrimitive } from '@octanejs/base-ui/dialog';
import { XIcon } from '@octanejs/lucide';

import { cn } from '../../../lib/utils';
import { Button } from './button.tsrx';

type Props = { className?: string; children?: OctaneNode } & Record<string, unknown>;

export function Dialog(props: Record<string, unknown>) @{
	<DialogPrimitive.Root data-slot="dialog" {...props} />
}

export function DialogTrigger(props: Record<string, unknown>) @{
	<DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

export function DialogPortal(props: Record<string, unknown>) @{
	<DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

export function DialogClose(props: Record<string, unknown>) @{
	<DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

export function DialogOverlay({ className, ...props }: Props) @{
	<DialogPrimitive.Backdrop
		data-slot="dialog-overlay"
		className={cn(
			'fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
			className,
		)}
		{...props}
	/>
}

export interface DialogContentProps extends Props {
	showCloseButton?: boolean;
}

export function DialogContent({
	className,
	children,
	showCloseButton = true,
	...props
}: DialogContentProps) {
	return createElement(
		DialogPrimitive.Portal,
		{ 'data-slot': 'dialog-portal' },
		createElement(DialogOverlay, { key: 'overlay' }),
		createElement(
			DialogPrimitive.Popup,
			{
				key: 'content',
				'data-slot': 'dialog-content',
				className: cn(
					'fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
					className,
				),
				...props,
			},
			children,
			showCloseButton
				? createElement(DialogPrimitive.Close, {
						key: 'close',
						'data-slot': 'dialog-close',
						className: 'absolute top-2 right-2',
						render: createElement(
							Button,
							{ variant: 'ghost', size: 'icon-sm' },
							createElement(XIcon, { key: 'icon' }),
							createElement('span', { key: 'sr', className: 'sr-only' }, 'Close'),
						),
					})
				: null,
		),
	);
}

export function DialogHeader({ className, ...props }: Props) @{
	<div data-slot="dialog-header" className={cn('flex flex-col gap-2', className)} {...props} />
}

export interface DialogFooterProps extends Props {
	showCloseButton?: boolean;
}

export function DialogFooter(props: DialogFooterProps) @{
	const { className, showCloseButton = false, children: _children, ...rest } = props;

	<div
		data-slot="dialog-footer"
		className={cn(
			'-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end',
			className,
		)}
		{...rest}
	>
		{props.children}
		{showCloseButton
			? createElement(DialogPrimitive.Close, {
					render: createElement(Button, { variant: 'outline' }, 'Close'),
				})
			: null}
	</div>
}

export function DialogTitle({ className, ...props }: Props) @{
	<DialogPrimitive.Title
		data-slot="dialog-title"
		className={cn('text-base leading-none font-medium', className)}
		{...props}
	/>
}

export function DialogDescription({ className, ...props }: Props) @{
	<DialogPrimitive.Description
		data-slot="dialog-description"
		className={cn(
			'text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground',
			className,
		)}
		{...props}
	/>
}
