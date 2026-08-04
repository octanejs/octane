// Base UI base hover-card — runs on @octanejs/base-ui's `PreviewCard`, which is Base UI's name for
// this family. Class strings from the maintainer-supplied radix source.
//
// THE OPEN/CLOSED DIALECT HAD TO BE REWRITTEN, and this is the one that would have failed loudest.
// The radix source for this family uses the OLDER spelling — `data-[state=open]:animate-in`,
// `data-[state=closed]:animate-out` — where the other menu families in this base use `data-open:`.
// Base UI publishes NO `data-state` attribute at all (verified by rendering an open card and
// querying for one: there is none). Copied across, every entry and exit utility would match nothing
// and the card would pop in and out with no animation whatsoever.
//
//     data-[state=open]:…    ->  data-open:…
//     data-[state=closed]:…  ->  data-closed:…
//
// The transform-origin variable is renamed for the same reason as every other overlay here:
// `--radix-hover-card-content-transform-origin` -> `--transform-origin`.
//
// PART TREE. Radix has Portal > Content; Base UI splits positioning into its own layer, the same
// shape this base's popover and dropdown-menu use:
//
//     radix     Root > Portal > Content
//     Base UI   Root > Portal > Positioner > Popup
//
// Positioning props are therefore destructured and forwarded to the Positioner. Swept onto `Popup`
// by a rest spread they are inert — `side="top"` would silently leave the card on its default side
// and also land on the DOM as an invalid attribute.
import { createElement } from 'octane';
import { PreviewCard as PreviewCardPrimitive } from '@octanejs/base-ui/preview-card';

import { cn } from '../../../lib/utils';

export interface BaseUiPositioningProps {
	/** Forwarded to the Positioner; see the note at the top of this file. */
	side?: 'top' | 'right' | 'bottom' | 'left';
	sideOffset?: number;
	align?: 'start' | 'center' | 'end';
	alignOffset?: number;
	anchor?: unknown;
	positionMethod?: 'absolute' | 'fixed';
	collisionBoundary?: unknown;
	collisionPadding?: unknown;
	collisionAvoidance?: unknown;
	arrowPadding?: number;
	sticky?: boolean;
	disableAnchorTracking?: boolean;
}

export function HoverCard(props: Record<string, unknown>) @{
	<PreviewCardPrimitive.Root data-slot="hover-card" {...props} />
}

export function HoverCardTrigger(props: Record<string, unknown>) @{
	<PreviewCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />
}

export interface HoverCardContentProps extends Record<string, unknown>, BaseUiPositioningProps {
	className?: string;
}

export function HoverCardContent({
	className,
	align = 'center',
	sideOffset = 4,
	side,
	alignOffset,
	anchor,
	positionMethod,
	collisionBoundary,
	collisionPadding,
	collisionAvoidance,
	arrowPadding,
	sticky,
	disableAnchorTracking,
	...props
}: HoverCardContentProps) {
	return createElement(PreviewCardPrimitive.Portal, {
		'data-slot': 'hover-card-portal',
		children: createElement(PreviewCardPrimitive.Positioner, {
			align,
			sideOffset,
			side,
			alignOffset,
			anchor,
			positionMethod,
			collisionBoundary,
			collisionPadding,
			collisionAvoidance,
			arrowPadding,
			sticky,
			disableAnchorTracking,
			children: createElement(PreviewCardPrimitive.Popup, {
				'data-slot': 'hover-card-content',
				className: cn(
					'z-50 w-64 origin-(--transform-origin) rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-hidden data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95',
					className,
				),
				...props,
			}),
		}),
	});
}
