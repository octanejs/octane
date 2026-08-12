// @ts-nocheck -- public props retain React DOM compatibility at the Octane render boundary.
import { useCallback, useEffect, useRef } from 'octane';
import type {
	ButtonHTMLAttributes,
	CSSProperties,
	HTMLAttributes,
	MouseEvent as ReactMouseEvent,
	MouseEventHandler,
	OptionHTMLAttributes,
	Ref,
	SelectHTMLAttributes,
	TableHTMLAttributes,
	ThHTMLAttributes,
} from 'react';
import type { CalendarDay, CalendarMonth, CalendarWeek } from '../classes/index.js';
import type { Modifiers } from '../types/index.js';
import { UI } from '../UI.js';
import { useDayPicker } from '../useDayPicker.js';

export function CaptionLabel(props: HTMLAttributes<HTMLSpanElement>) @{
	<span {...props} />
}
export type CaptionLabelProps = Parameters<typeof CaptionLabel>[0];

export function Chevron(props: {
	className?: string;
	style?: CSSProperties;
	size?: number;
	disabled?: boolean;
	orientation?: 'up' | 'down' | 'left' | 'right';
}) @{
	const { size = 24, orientation = 'left', className, style } = props;
	<svg className={className} style={style} width={size} height={size} viewBox="0 0 24 24">
		{orientation === 'up' &&
			<polygon points="6.77 17 12.5 11.43 18.24 17 20 15.28 12.5 8 5 15.28" />}
		{orientation === 'down' &&
			<polygon points="6.77 8 12.5 13.57 18.24 8 20 9.72 12.5 17 5 9.72" />}
		{orientation === 'left' &&
			<polygon points="16 18.112 9.81111111 12 16 5.87733333 14.0888889 4 6 12 14.0888889 20" />}
		{orientation === 'right' &&
			<polygon points="8 18.112 14.18888889 12 8 5.87733333 9.91111111 4 18 12 9.91111111 20" />}
	</svg>
}
export type ChevronProps = Parameters<typeof Chevron>[0];

export type DayProps = { day: CalendarDay; modifiers: Modifiers } & HTMLAttributes<HTMLDivElement>;
export function Day(props: DayProps) @{
	const { day: _day, modifiers: _modifiers, ...cellProps } = props;
	<td {...cellProps} />
}

export type DayButtonProps =
	{ day: CalendarDay; modifiers: Modifiers } & ButtonHTMLAttributes<HTMLButtonElement>;
export function DayButton(props: DayButtonProps) @{
	const { day: _day, modifiers, ...buttonProps } = props;
	const ref = useRef<HTMLButtonElement | null>(null);
	useEffect(() => {
		if (modifiers.focused) ref.current?.focus();
	}, [modifiers.focused]);
	<button ref={ref} {...buttonProps} />
}

export type DropdownOption = { value: number; label: string; disabled: boolean };
export type DropdownProps =
	{ options?: DropdownOption[] } & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'>;
export function Dropdown(props: DropdownProps) @{
	const { options, className, ...selectProps } = props;
	const { classNames, components, styles } = useDayPicker();
	const cssClassSelect = [classNames[UI.Dropdown], className].filter(Boolean).join(' ');
	const selectedOption = options?.find(({ value }) => value === selectProps.value);
	<span
		data-disabled={selectProps.disabled}
		className={classNames[UI.DropdownRoot]}
		style={styles?.[UI.DropdownRoot]}
	>
		<components.Select className={cssClassSelect} {...selectProps}>
			{options?.map(
				({ value, label, disabled }) =>
					<components.Option
						key={value}
						value={value}
						disabled={disabled}
					>{label}</components.Option>,
			)}
		</components.Select>
		<span className={classNames[UI.CaptionLabel]} style={styles?.[UI.CaptionLabel]} aria-hidden>
			{selectedOption?.label}
			<components.Chevron
				orientation="down"
				size={18}
				className={classNames[UI.Chevron]}
				style={styles?.[UI.Chevron]}
			/>
		</span>
	</span>
}

export function DropdownNav(props: HTMLAttributes<HTMLDivElement>) @{
	<div {...props} />
}
export type DropdownNavProps = Parameters<typeof DropdownNav>[0];
export function Footer(props: HTMLAttributes<HTMLDivElement>) @{
	<div {...props} />
}
export type FooterProps = Parameters<typeof Footer>[0];

export type MonthProps =
	{ calendarMonth: CalendarMonth; displayIndex: number } & HTMLAttributes<HTMLDivElement>;
export function Month(props: MonthProps) @{
	const { calendarMonth: _calendarMonth, displayIndex: _displayIndex, ...divProps } = props;
	<div {...divProps}>{props.children}</div>
}
export type MonthCaptionProps = MonthProps;
export function MonthCaption(props: MonthCaptionProps) @{
	const { calendarMonth: _calendarMonth, displayIndex: _displayIndex, ...divProps } = props;
	<div {...divProps} />
}
export function MonthGrid(props: TableHTMLAttributes<HTMLTableElement>) @{
	<table {...props} />
}
export type MonthGridProps = Parameters<typeof MonthGrid>[0];
export function Months(props: HTMLAttributes<HTMLDivElement>) @{
	<div {...props} />
}
export type MonthsProps = Parameters<typeof Months>[0];

export function MonthsDropdown(props: DropdownProps) @{
	const { components } = useDayPicker();
	<components.Dropdown {...props} />
}
export function YearsDropdown(props: DropdownProps) @{
	const { components } = useDayPicker();
	<components.Dropdown {...props} />
}

export type NavProps =
	{
		onPreviousClick?: MouseEventHandler<HTMLButtonElement>;
		onNextClick?: MouseEventHandler<HTMLButtonElement>;
		previousMonth?: Date;
		nextMonth?: Date;
	} & HTMLAttributes<HTMLElement>;
export function Nav(props: NavProps) @{
	const { onPreviousClick, onNextClick, previousMonth, nextMonth, ...navProps } = props;
	const { components, classNames, styles, labels: { labelPrevious, labelNext } } = useDayPicker();
	const handleNextClick = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
		if (nextMonth) onNextClick?.(event);
	}, [nextMonth, onNextClick]);
	const handlePreviousClick = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
		if (previousMonth) onPreviousClick?.(event);
	}, [previousMonth, onPreviousClick]);
	<nav {...navProps}>
		<components.PreviousMonthButton
			type="button"
			className={classNames[UI.PreviousMonthButton]}
			style={styles?.[UI.PreviousMonthButton]}
			tabIndex={previousMonth ? undefined : -1}
			aria-disabled={previousMonth ? undefined : true}
			aria-label={labelPrevious(previousMonth)}
			onClick={handlePreviousClick}
		>
			<components.Chevron
				disabled={previousMonth ? undefined : true}
				className={classNames[UI.Chevron]}
				style={styles?.[UI.Chevron]}
				orientation="left"
			/>
		</components.PreviousMonthButton>
		<components.NextMonthButton
			type="button"
			className={classNames[UI.NextMonthButton]}
			style={styles?.[UI.NextMonthButton]}
			tabIndex={nextMonth ? undefined : -1}
			aria-disabled={nextMonth ? undefined : true}
			aria-label={labelNext(nextMonth)}
			onClick={handleNextClick}
		>
			<components.Chevron
				disabled={nextMonth ? undefined : true}
				className={classNames[UI.Chevron]}
				style={styles?.[UI.Chevron]}
				orientation="right"
			/>
		</components.NextMonthButton>
	</nav>
}

export function NextMonthButton(props: ButtonHTMLAttributes<HTMLButtonElement>) @{
	<button {...props} />
}
export type NextMonthButtonProps = Parameters<typeof NextMonthButton>[0];
export function PreviousMonthButton(props: ButtonHTMLAttributes<HTMLButtonElement>) @{
	<button {...props} />
}
export type PreviousMonthButtonProps = Parameters<typeof PreviousMonthButton>[0];
export function Option(props: OptionHTMLAttributes<HTMLOptionElement>) @{
	<option {...props} />
}
export type OptionProps = Parameters<typeof Option>[0];
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) @{
	<select {...props} />
}
export type SelectProps = Parameters<typeof Select>[0];
export type RootProps = { rootRef?: Ref<HTMLDivElement> } & HTMLAttributes<HTMLDivElement>;
export function Root(props: RootProps) @{
	const { rootRef, ...rest } = props;
	<div {...rest} ref={rootRef} />
}

export type WeekProps = { week: CalendarWeek } & HTMLAttributes<HTMLTableRowElement>;
export function Week(props: WeekProps) @{
	const { week: _week, ...rowProps } = props;
	<tr {...rowProps} />
}
export type WeekNumberProps = { week: CalendarWeek } & ThHTMLAttributes<HTMLTableCellElement>;
export function WeekNumber(props: WeekNumberProps) @{
	const { week: _week, ...cellProps } = props;
	<th {...cellProps} />
}
export function WeekNumberHeader(props: ThHTMLAttributes<HTMLTableCellElement>) @{
	<th {...props} />
}
export type WeekNumberHeaderProps = Parameters<typeof WeekNumberHeader>[0];
export function Weekday(props: ThHTMLAttributes<HTMLTableCellElement>) @{
	<th {...props} />
}
export type WeekdayProps = Parameters<typeof Weekday>[0];
export function Weekdays(props: HTMLAttributes<HTMLTableRowElement>) @{
	<thead aria-hidden>
		<tr {...props} />
	</thead>
}
export type WeekdaysProps = Parameters<typeof Weekdays>[0];
export function Weeks(props: HTMLAttributes<HTMLTableSectionElement>) @{
	<tbody {...props} />
}
export type WeeksProps = Parameters<typeof Weeks>[0];
