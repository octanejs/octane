// Default-Tailwind dialog flavor (package canonical) — user-supplied styling,
// class strings verbatim. Octane adaptations: "use client" dropped,
// lucide-react → @octanejs/lucide, radix-ui → @octanejs/radix. DialogContent
// composes Portal > Overlay + Content with createElement (radix's Portal
// slots its child — descriptors required); consumer children flow through
// the props.children channel (ChildrenHost beside sibling descriptors);
// template parts use the {props.children} lowering.
import { createElement, type OctaneNode } from 'octane';
import { Dialog as DialogPrimitive } from '@octanejs/radix';
import { XIcon } from '@octanejs/lucide';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type Props = { className?: string; children?: OctaneNode } & Record<string, unknown>;

// Opaque compiled children cannot sit directly inside a children ARRAY next to
// sibling descriptors — route them through a pass-through component.
function ChildrenHost(props: { children?: OctaneNode }): OctaneNode {
	return props.children as OctaneNode;
}

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
	<DialogPrimitive.Overlay
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
			DialogPrimitive.Content,
			{
				key: 'content',
				'data-slot': 'dialog-content',
				className: cn(
					'fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
					className,
				),
				...props,
			},
			createElement(ChildrenHost, { key: 'children', children }),
			showCloseButton
				? createElement(
						DialogPrimitive.Close,
						{ key: 'close', 'data-slot': 'dialog-close', asChild: true },
						createElement(
							Button,
							{ variant: 'ghost', className: 'absolute top-2 right-2', size: 'icon-sm' },
							createElement(XIcon, { key: 'icon' }),
							createElement('span', { key: 'sr', className: 'sr-only' }, 'Close'),
						),
					)
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
			? createElement(
					DialogPrimitive.Close,
					{ asChild: true },
					createElement(Button, { variant: 'outline' }, 'Close'),
				)
			: null}
	</div>
}

export function DialogTitle({ className, ...props }: Props) @{
	<DialogPrimitive.Title
		data-slot="dialog-title"
		className={cn('cn-font-heading text-base leading-none font-medium', className)}
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
