// Base UI base radio-group — runs on @octanejs/base-ui's `RadioGroup` plus `Radio`.
//
// PART MAPPING DIFFERS FROM RADIX. Radix nests everything under one namespace
// (RadioGroup.Root / .Item / .Indicator); Base UI splits the group from the item, so the item
// is `Radio.Root` from a separate subpath and the indicator is `Radio.Indicator`. The exported
// component names and every data-slot stay as shadcn defines them, so consumers see no
// difference — this is wiring, not API.
//
// `disabled:` becomes `data-disabled:` for the same reason as checkbox and switch: Radio.Root
// renders a `<span role="radio">`, which is never `:disabled`, so the pseudo-class variant could
// never match. The primitive publishes `data-disabled` instead.
//
// THE ROOT MUST CARRY ITS OWN DISPLAY, and this is the second consequence of that same `<span>`.
// Radix's radio root is a `<button>`, which is `display: inline-block` by default, so its class
// string never needed one and `size-4` just worked. A bare `<span>` is `display: inline`, where
// width and height are IGNORED — the box collapses and only `border` paints, rendering the control
// as a thin vertical bar beside its label rather than a circle. The React Aria base hit the same
// thing (its root is not a button either) and carries `relative flex` for it; this base copied the
// radix string and lost it. Hence `relative flex … items-center justify-center` here.
//
// The indicator is `size-full` rather than `relative` so the dot, which positions itself with
// `absolute … -translate-1/2`, anchors to the ROOT's 16px box — matching the React Aria base. Left
// `relative`, it would anchor to a zero-sized flex item and sit off-centre.
//
// UNVERIFIED PROVENANCE: the non-conditional utilities come from this package's radix base
// rather than upstream's Base UI source.
import { RadioGroup as RadioGroupPrimitive } from '@octanejs/base-ui/radio-group';
import { Radio as RadioPrimitive } from '@octanejs/base-ui/radio';
import { CircleIcon } from '@octanejs/lucide';

import { cn } from '../../../lib/utils';

type Props = { className?: string } & Record<string, unknown>;

// Base UI's Radio.Root requires `value` (Radix infers it from the item), so the item's props
// type demands it. shadcn usage always passes one, so this tightens the type without changing
// the surface.
type ItemProps = { className?: string; value: any } & Record<string, unknown>;

export function RadioGroup({ className, ...props }: Props) @{
	<RadioGroupPrimitive data-slot="radio-group" className={cn('grid gap-3', className)} {...props} />
}

export function RadioGroupItem({ className, ...props }: ItemProps) @{
	<RadioPrimitive.Root
		data-slot="radio-group-item"
		className={cn(
			'relative flex aspect-square size-4 shrink-0 items-center justify-center rounded-full border border-input text-primary shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-disabled:cursor-not-allowed data-disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:ring-destructive/40',
			className,
		)}
		{...props}
	>
		<RadioPrimitive.Indicator
			data-slot="radio-group-indicator"
			className="flex size-full items-center justify-center"
		>
			<CircleIcon
				className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 fill-primary"
			/>
		</RadioPrimitive.Indicator>
	</RadioPrimitive.Root>
}
