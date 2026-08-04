// Base UI base alert-dialog — transcribed from upstream's `bases/base-ui/ui/alert-dialog.tsx`
// (maintainer-supplied), running on @octanejs/base-ui's AlertDialog. Upstream part mapping:
// Overlay -> Backdrop, Content -> Popup, Cancel -> Close. This port also composes Action via Close.
//
// TWO DELIBERATE DEPARTURES FROM THE SOURCE:
// - Upstream's AlertDialogTitle carries `cn-font-heading`, a semantic hook from the pinned cn-*
//   system. This package ships the default-Tailwind utilities-inlined flavor instead, the
//   react-aria base already drops this exact class for that reason, and nothing in the playground
//   defines it (0 occurrences in the built CSS), so keeping it would ship a class that resolves
//   to nothing. Every other class string is verbatim.
// - Upstream renders AlertDialogAction as a plain Button, so it does not dismiss the dialog.
//   Composing it through Close preserves the public Button-like API and supplies the expected
//   confirm-and-dismiss behavior shown by Base UI's own alert-dialog examples.
//
// Octane adaptations: no `"use client"`; refs are props. AlertDialogContent composes its
// Portal/Overlay/Popup tree internally, so consumer children still flow through the ordinary
// props.children channel.
import { AlertDialog as AlertDialogPrimitive } from '@octanejs/base-ui/alert-dialog';

import { cn } from '../../../lib/utils';
import type { DivProps } from '../../../lib/types';
import { Button } from './button.tsrx';

export function AlertDialog({ ...props }: Record<string, any>) @{
	<AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
}

export function AlertDialogTrigger({ ...props }: Record<string, any>) @{
	<AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
}

export function AlertDialogPortal({ ...props }: Record<string, any>) @{
	<AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
}

export function AlertDialogOverlay({ className, ...props }: Record<string, any>) @{
	<AlertDialogPrimitive.Backdrop
		data-slot="alert-dialog-overlay"
		className={cn(
			'fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
			className,
		)}
		{...props}
	/>
}

export function AlertDialogContent({ className, size = 'default', ...props }: Record<
	string,
	any
>) @{
	<AlertDialogPortal>
		<AlertDialogOverlay key="overlay" />
		<AlertDialogPrimitive.Popup
			key="content"
			data-slot="alert-dialog-content"
			data-size={size}
			className={cn(
				'group/alert-dialog-content fixed top-1/2 left-1/2 z-50 grid w-full -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none data-[size=default]:max-w-xs data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
				className,
			)}
			{...props}
		/>
	</AlertDialogPortal>
}

export function AlertDialogHeader({ className, ...props }: DivProps) @{
	<div
		data-slot="alert-dialog-header"
		className={cn(
			'grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-4 sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-left sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]',
			className,
		)}
		{...props}
	/>
}

export function AlertDialogFooter({ className, ...props }: DivProps) @{
	<div
		data-slot="alert-dialog-footer"
		className={cn(
			'-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end',
			className,
		)}
		{...props}
	/>
}

export function AlertDialogMedia({ className, ...props }: DivProps) @{
	<div
		data-slot="alert-dialog-media"
		className={cn(
			'mb-2 inline-flex size-10 items-center justify-center rounded-md bg-muted sm:group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*=\'size-\'])]:size-6',
			className,
		)}
		{...props}
	/>
}

export function AlertDialogTitle({ className, ...props }: Record<string, any>) @{
	<AlertDialogPrimitive.Title
		data-slot="alert-dialog-title"
		className={cn(
			'text-base font-medium sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2',
			className,
		)}
		{...props}
	/>
}

export function AlertDialogDescription({ className, ...props }: Record<string, any>) @{
	<AlertDialogPrimitive.Description
		data-slot="alert-dialog-description"
		className={cn(
			'text-sm text-balance text-muted-foreground md:text-pretty *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground',
			className,
		)}
		{...props}
	/>
}

export function AlertDialogAction({
	className,
	variant = 'default',
	size = 'default',
	...props
}: Record<string, any>) @{
	<AlertDialogPrimitive.Close
		data-slot="alert-dialog-action"
		className={cn(className)}
		render={<Button variant={variant} size={size} />}
		{...props}
	/>
}

// `render` takes an ELEMENT here, not a function — that is Base UI's render-prop contract, and
// it is what lets each action keep Close's dismiss behavior while looking like a Button.
export function AlertDialogCancel({
	className,
	variant = 'outline',
	size = 'default',
	...props
}: Record<string, any>) @{
	<AlertDialogPrimitive.Close
		data-slot="alert-dialog-cancel"
		className={cn(className)}
		render={<Button variant={variant} size={size} />}
		{...props}
	/>
}
