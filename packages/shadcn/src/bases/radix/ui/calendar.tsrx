// Adapted from shadcn/ui 4.21.0 (7c9eaba1), the package-canonical default-Tailwind flavor.
// MIT: see LICENSE.upstream. Octane uses native events and refs as props.
//
// This family has no Radix primitive: upstream's `radix` and `base` sources are the same file
// (they differ only in the `ui/button` import and one `ref`), both wrapping react-day-picker. Here
// that is @octanejs/day-picker, which pins react-day-picker 10.0.1.
//
// Octane adaptations:
//   - react-day-picker -> @octanejs/day-picker, and the package's named component prop types
//     (RootProps, ChevronProps, DayButtonProps, WeekNumberProps) replace
//     React.ComponentProps<typeof X>.
//   - IconPlaceholder resolves at port time to lucide via @octanejs/lucide.
//   - Nova's three `.cn-calendar*` rules are inlined as utilities, the way card.tsrx inlines
//     `.cn-card`: src/styles/theme.css ships tokens, not component rules, so a class string
//     shipped without its definition would be inert. `--cell-size`/`--cell-radius` are therefore
//     declared by the root's own arbitrary-property utilities, which is where upstream's style
//     layer declares them too. `cn-calendar-caption` and `cn-calendar-day-button` have no Nova
//     rule and are dropped, as the unused `cn-menu-*` hooks are in Select; `cn-rtl-flip` is
//     defined in theme.css and stays verbatim.
//   - The `components` overrides leave the inline object literal: three become module-level and
//     the one that closes over `locale` is memoized, so a re-render does not replace their
//     component types; see the note above them.
//   - CalendarDayButton's ref is an ordinary prop, not forwardRef.
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from '@octanejs/lucide';
import {
	DayPicker,
	getDefaultClassNames,
	type ChevronProps,
	type DayButtonProps,
	type DayPickerProps,
	type Locale,
	type RootProps,
	type WeekNumberProps,
} from '@octanejs/day-picker';
import { useEffect, useMemo, useRef } from 'octane';
import { cn } from 'cn';
import { Button, buttonVariants, type ButtonProps } from './button.tsrx';

export type CalendarProps =
	DayPickerProps & {
		buttonVariant?: ButtonProps['variant'];
	};

export type CalendarDayButtonProps =
	DayButtonProps & {
		locale?: Partial<Locale>;
	};

// Upstream declares these overrides inline in the `components` prop, so every render creates new
// component types and remounts their whole subtree: 35 day buttons per selection. Three are
// module-level here, and the fourth (it closes over `locale`) is memoized in Calendar, so node
// identity survives a re-render. The rendered markup is unchanged.
function CalendarRoot({ className, rootRef, ...props }: RootProps) @{
	<div data-slot="calendar" ref={rootRef} className={cn(className)} {...props} />
}

function CalendarChevron({ className, orientation, ...props }: ChevronProps) @{
	// Upstream maps left/right to their own icons and everything else to the dropdown's
	// down-chevron. Only the horizontal pair mirrors in RTL.
	const horizontal = orientation === 'left' || orientation === 'right';
	const Icon =
		!horizontal
			? ChevronDownIcon
			: orientation === 'left'
				? ChevronLeftIcon
				: ChevronRightIcon;

	<Icon className={cn(horizontal && 'cn-rtl-flip', 'size-4', className)} {...props} />
}

function CalendarWeekNumber({ children, ...props }: WeekNumberProps) @{
	<td {...props}>
		<div
			className="flex size-(--cell-size) items-center justify-center text-center"
		>{children}</div>
	</td>
}

export function Calendar({
	className,
	classNames,
	showOutsideDays = true,
	captionLayout = 'label',
	buttonVariant = 'ghost',
	locale,
	formatters,
	components,
	...props
}: CalendarProps) @{
	const defaultClassNames = getDefaultClassNames();
	const dayButton = useMemo(
		() => (dayButtonProps: DayButtonProps) =>
			<CalendarDayButton locale={locale} {...dayButtonProps} />,
		[locale],
	);

	<DayPicker
		showOutsideDays={showOutsideDays}
		className={cn(
			'group/calendar bg-background p-2 in-data-[slot=card-content]:bg-transparent in-data-[slot=popover-content]:bg-transparent [--cell-radius:var(--radius-md)] [--cell-size:--spacing(7)]',
			String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
			String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
			className,
		)}
		captionLayout={captionLayout}
		locale={locale}
		formatters={{
			formatMonthDropdown: (date) => date.toLocaleString(locale?.code, { month: 'short' }),
			...formatters,
		}}
		classNames={{
			root: cn('w-fit', defaultClassNames.root),
			months: cn('relative flex flex-col gap-4 md:flex-row', defaultClassNames.months),
			month: cn('flex w-full flex-col gap-4', defaultClassNames.month),
			nav: cn(
				'absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1',
				defaultClassNames.nav,
			),
			button_previous: cn(
				buttonVariants({ variant: buttonVariant }),
				'size-(--cell-size) p-0 select-none aria-disabled:opacity-50',
				defaultClassNames.button_previous,
			),
			button_next: cn(
				buttonVariants({ variant: buttonVariant }),
				'size-(--cell-size) p-0 select-none aria-disabled:opacity-50',
				defaultClassNames.button_next,
			),
			month_caption: cn(
				'flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)',
				defaultClassNames.month_caption,
			),
			dropdowns: cn(
				'flex h-(--cell-size) w-full items-center justify-center gap-1.5 text-sm font-medium',
				defaultClassNames.dropdowns,
			),
			dropdown_root: cn(
				'relative rounded-(--cell-radius) border border-input has-focus:border-ring has-focus:ring-3 has-focus:ring-ring/50',
				defaultClassNames.dropdown_root,
			),
			dropdown: cn('absolute inset-0 bg-popover opacity-0', defaultClassNames.dropdown),
			caption_label: cn(
				'font-medium select-none',
				captionLayout === 'label'
					? 'text-sm'
					: 'flex h-6 items-center gap-1 rounded-(--cell-radius) pr-1 pl-1.5 text-sm [&>svg]:size-3.5 [&>svg]:text-muted-foreground',
				defaultClassNames.caption_label,
			),
			month_grid: cn('w-full border-collapse', defaultClassNames.month_grid),
			weekdays: cn('flex', defaultClassNames.weekdays),
			weekday: cn(
				'flex-1 rounded-(--cell-radius) text-[0.8rem] font-normal text-muted-foreground select-none',
				defaultClassNames.weekday,
			),
			week: cn('mt-2 flex w-full', defaultClassNames.week),
			week_number_header: cn('w-(--cell-size) select-none', defaultClassNames.week_number_header),
			week_number: cn(
				'text-[0.8rem] text-muted-foreground select-none',
				defaultClassNames.week_number,
			),
			day: cn(
				'group/day relative aspect-square h-full w-full rounded-(--cell-radius) p-0 text-center select-none [&:last-child[data-selected=true]_button]:rounded-r-(--cell-radius)',
				props.showWeekNumber
					? '[&:nth-child(2)[data-selected=true]_button]:rounded-l-(--cell-radius)'
					: '[&:first-child[data-selected=true]_button]:rounded-l-(--cell-radius)',
				defaultClassNames.day,
			),
			range_start: cn(
				'relative isolate z-0 rounded-l-(--cell-radius) bg-muted after:absolute after:inset-y-0 after:right-0 after:w-4 after:bg-muted',
				defaultClassNames.range_start,
			),
			range_middle: cn('rounded-none', defaultClassNames.range_middle),
			range_end: cn(
				'relative isolate z-0 rounded-r-(--cell-radius) bg-muted after:absolute after:inset-y-0 after:left-0 after:w-4 after:bg-muted',
				defaultClassNames.range_end,
			),
			today: cn(
				'rounded-(--cell-radius) bg-muted text-foreground data-[selected=true]:rounded-none',
				defaultClassNames.today,
			),
			outside: cn(
				'text-muted-foreground aria-selected:text-muted-foreground',
				defaultClassNames.outside,
			),
			disabled: cn('text-muted-foreground opacity-50', defaultClassNames.disabled),
			hidden: cn('invisible', defaultClassNames.hidden),
			...classNames,
		}}
		components={{
			Root: CalendarRoot,
			Chevron: CalendarChevron,
			DayButton: dayButton,
			WeekNumber: CalendarWeekNumber,
			...components,
		}}
		{...props}
	/>
}

export function CalendarDayButton({
	className,
	day,
	modifiers,
	locale,
	...props
}: CalendarDayButtonProps) @{
	const defaultClassNames = getDefaultClassNames();

	const ref = useRef<HTMLButtonElement | null>(null);
	useEffect(() => {
		if (modifiers.focused) ref.current?.focus();
	}, [modifiers.focused]);

	<Button
		ref={ref}
		variant="ghost"
		size="icon"
		data-day={day.date.toLocaleDateString(locale?.code)}
		data-selected-single={modifiers.selected && !modifiers.range_start && !modifiers.range_end &&
			!modifiers.range_middle}
		data-range-start={modifiers.range_start}
		data-range-end={modifiers.range_end}
		data-range-middle={modifiers.range_middle}
		className={cn(
			'relative isolate z-10 flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 border-0 leading-none font-normal group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-[3px] group-data-[focused=true]/day:ring-ring/50 data-[range-end=true]:rounded-(--cell-radius) data-[range-end=true]:rounded-r-(--cell-radius) data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground data-[range-middle=true]:rounded-none data-[range-middle=true]:bg-muted data-[range-middle=true]:text-foreground data-[range-start=true]:rounded-(--cell-radius) data-[range-start=true]:rounded-l-(--cell-radius) data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground dark:hover:text-foreground [&>span]:text-xs [&>span]:opacity-70',
			defaultClassNames.day,
			className,
		)}
		{...props}
	/>
}
