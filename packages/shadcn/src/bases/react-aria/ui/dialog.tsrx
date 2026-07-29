import { type OctaneNode } from 'octane';
import {
	Dialog as DialogPrimitive,
	DialogTrigger as DialogTriggerPrimitive,
	Heading,
	ModalOverlay as ModalOverlayPrimitive,
	Modal as ModalPrimitive,
	type DialogProps as DialogPrimitiveProps,
	type DialogTriggerProps as DialogTriggerPrimitiveProps,
	type ModalOverlayProps as ModalOverlayPrimitiveProps,
} from '@octanejs/aria/components';

import { cn } from '../../../lib/utils';
import type { HostProps } from '../../../lib/types';
import { Button } from './button.tsrx';
import { XIcon } from '@octanejs/lucide';

export function DialogTrigger({ ...props }: DialogTriggerPrimitiveProps) {
	return <DialogTriggerPrimitive data-slot="dialog-trigger" {...props} />;
}

export function DialogClose({ className, variant = 'outline', size = 'default', ...props }: Record<
	string,
	any
>) {
	return <Button
		slot="close"
		data-slot="dialog-close"
		variant={variant}
		size={size}
		className={cn(className)}
		{...props}
	/>;
}

export function DialogOverlay({ className, children, ...props }: Omit<
	ModalOverlayPrimitiveProps,
	'className' | 'children'
> & {
	className?: string;
	children: OctaneNode;
}) {
	return <ModalOverlayPrimitive
		data-slot="dialog-overlay"
		className={cn(
			'fixed inset-0 isolate z-50 bg-black/10 duration-100 data-entering:animate-in data-entering:fade-in-0 data-exiting:animate-out data-exiting:fade-out-0 supports-backdrop-filter:backdrop-blur-xs',
			className,
		)}
		{...props}
	>{children}</ModalOverlayPrimitive>;
}

export function Dialog({
	className,
	children,
	showCloseButton = true,
	isDismissable = true,
	...props
}: Omit<ModalOverlayPrimitiveProps, 'className' | 'children'> & Pick<
	Record<string, any>,
	'isDismissable'
> & {
	className?: string;
	children: OctaneNode;
	showCloseButton?: boolean;
}) {
	return <DialogOverlay isDismissable={isDismissable} {...props}>
		<ModalPrimitive
			data-slot="dialog-content"
			className={cn(
				'fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none data-entering:animate-in data-entering:fade-in-0 data-entering:zoom-in-95 data-exiting:animate-out data-exiting:fade-out-0 data-exiting:zoom-out-95 sm:max-w-sm',
				className,
			)}
		>
			<DialogPrimitive data-slot="dialog" className="[display:inherit] [gap:inherit] outline-none">
				{children}
				{showCloseButton &&
					<DialogClose variant="ghost" className="absolute top-2 right-2" size="icon-sm">
						<XIcon />
						<span className="sr-only">Close</span>
					</DialogClose>}
			</DialogPrimitive>
		</ModalPrimitive>
	</DialogOverlay>;
}

export function DialogHeader({ className, ...props }: HostProps<'div'>) {
	return <div
		data-slot="dialog-header"
		className={cn('flex flex-col gap-2', className)}
		{...props}
	/>;
}

export function DialogFooter({ className, showCloseButton = false, children, ...props }: HostProps<
	'div'
> & {
	showCloseButton?: boolean;
}) {
	return <div
		data-slot="dialog-footer"
		className={cn(
			'-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end',
			className,
		)}
		{...props}
	>
		{children}
		{showCloseButton && <DialogClose variant="outline">Close</DialogClose>}
	</div>;
}

export function DialogTitle({ className, ...props }: Omit<Record<string, any>, 'slot'>) {
	return <Heading
		slot="title"
		data-slot="dialog-title"
		className={cn('text-base leading-none font-medium', className)}
		{...props}
	/>;
}

export function DialogDescription({ className, ...props }: Omit<HostProps<'div'>, 'slot'>) {
	return <div
		data-slot="dialog-description"
		className={cn(
			'text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground',
			className,
		)}
		{...props}
	/>;
}
