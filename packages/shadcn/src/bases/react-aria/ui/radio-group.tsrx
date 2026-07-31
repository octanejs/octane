// OCTANE ADAPTATION: octane's renderable type is `OctaneNode = unknown`, and a
// union containing `unknown` collapses to `unknown` — so RAC's
// `ChildrenOrFunction` cannot keep its render-prop arm distinguishable the way
// React's precise `ReactNode` union does, and composeRenderProps has nothing to
// infer its render values from. Annotating them here restores the upstream
// parameter types without weakening the binding.
import {
	composeRenderProps,
	RadioGroup as RadioGroupPrimitive,
	Radio as RadioPrimitive,
	type RadioGroupProps,
	type RadioRenderProps,
	type RadioProps,
} from '@octanejs/aria/components';

import { cn } from '../../../lib/utils';

export function RadioGroup({ className, ...props }: RadioGroupProps) {
	return <RadioGroupPrimitive
		data-slot="radio-group"
		className={cn('grid w-full gap-2', className)}
		{...props}
	/>;
}

export function RadioGroupItem({ className, children, ...props }: RadioProps) {
	return <RadioPrimitive
		data-slot="radio-group-item"
		className={cn(
			'group/radio-group-item peer relative flex aspect-square size-4 shrink-0 rounded-full border border-input outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary data-focus-visible:border-ring data-focus-visible:ring-3 data-focus-visible:ring-ring/50 data-invalid:border-destructive data-invalid:ring-3 data-invalid:ring-destructive/20 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 dark:data-invalid:border-destructive/50 dark:data-invalid:ring-destructive/40 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground dark:data-checked:bg-primary data-selected:border-primary data-selected:bg-primary data-selected:text-primary-foreground data-invalid:data-selected:border-primary dark:data-selected:bg-primary',
			className,
		)}
		{...props}
	>{composeRenderProps(
		children,
		(children, { isSelected }: RadioRenderProps) => <>
			<span data-slot="radio-group-indicator" className="flex size-4 items-center justify-center">
				{isSelected &&
					<span
						className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-foreground"
					/>}
			</span>
			{children}
		</>,
	)}</RadioPrimitive>;
}
