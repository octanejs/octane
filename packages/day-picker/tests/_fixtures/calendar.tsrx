// @ts-nocheck -- fixtures intentionally exercise React-compatible DOM prop boundaries.
import { useState } from 'octane';
import {
	DayPicker,
	type DateRange,
	type DayButtonProps,
	type FooterProps,
	useDayPicker,
} from '../../src/index.ts';

/** DayPicker reports local-midnight Dates; UTC rendering shifts the day east of UTC. */
const localIsoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
	2,
	'0',
)}-${String(date.getDate()).padStart(2, '0')}`;

const localIsoMonth = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
	2,
	'0',
)}`;

export function CalendarFixture() @{
	const [selected, setSelected] = useState<Date | undefined>();
	<main>
		<output id="selection">
			{selected ? localIsoDate(selected) : 'none'}
		</output>
		<DayPicker
			mode="single"
			month={new Date(2026, 7, 1)}
			selected={selected}
			onSelect={setSelected}
		/>
	</main>
}

export function ServerCalendarFixture() @{
	<DayPicker month={new Date(2026, 7, 1)} />
}

export function NavigationFixture() @{
	<DayPicker defaultMonth={new Date(2026, 7, 1)} />
}

export function ControlledNavigationFixture() @{
	const [requestedMonth, setRequestedMonth] = useState('none');
	<main>
		<output id="requested-month">{requestedMonth}</output>
		<DayPicker
			month={new Date(2026, 7, 1)}
			onMonthChange={(month) => setRequestedMonth(localIsoMonth(month))}
		/>
	</main>
}

function PropsFooter(props: FooterProps) @{
	const { dayPickerProps } = useDayPicker();
	<div
		{...props}
		data-has-month={String(dayPickerProps.month !== undefined)}
		data-has-on-month-change={String(dayPickerProps.onMonthChange !== undefined)}
	/>
}

export function UncontrolledBoundsFixture() @{
	const [bounded, setBounded] = useState(false);
	<main>
		<button onClick={() => setBounded(true)}>Change bounds</button>
		<DayPicker
			defaultMonth={new Date(2026, 7, 1)}
			startMonth={bounded ? new Date(2026, 9, 1) : undefined}
			endMonth={bounded ? new Date(2026, 11, 1) : undefined}
			footer="props"
			components={{ Footer: PropsFooter }}
		/>
	</main>
}

export function TimeZoneNavigationFixture() @{
	const [timeZone, setTimeZone] = useState('UTC');
	<main>
		<button onClick={() => setTimeZone('America/Los_Angeles')}>Use Los Angeles</button>
		<DayPicker defaultMonth={new Date('2026-08-01T01:00:00.000Z')} timeZone={timeZone} />
	</main>
}

export function MultipleFixture() @{
	const [selected, setSelected] = useState<Date[]>([]);
	<main>
		<output id="multiple-count">{selected.length}</output>
		<DayPicker
			mode="multiple"
			month={new Date(2026, 7, 1)}
			selected={selected}
			onSelect={setSelected}
		/>
	</main>
}

export function RangeFixture() @{
	const [selected, setSelected] = useState<DateRange | undefined>();
	<main>
		<output id="range-value">
			{selected?.from?.getDate() ?? '-'}:{selected?.to?.getDate() ?? '-'}
		</output>
		<DayPicker
			mode="range"
			month={new Date(2026, 7, 1)}
			selected={selected}
			onSelect={setSelected}
		/>
	</main>
}

function CustomDayButton(props: DayButtonProps) @{
	const { day, modifiers: _modifiers, children: _children, ...buttonProps } = props;
	<button {...buttonProps} data-custom-day="true">{day.date.getDate()}</button>
}

export function ConstraintsFixture() @{
	<DayPicker
		mode="single"
		month={new Date(2026, 7, 1)}
		disabled={new Date(2026, 7, 10)}
		hidden={new Date(2026, 7, 11)}
		showOutsideDays
		components={{ DayButton: CustomDayButton }}
	/>
}

/** Default DayButton path for differential oracle comparison (no custom components). */
export function DefaultConstraintsFixture() @{
	<DayPicker
		mode="single"
		month={new Date(2026, 7, 1)}
		disabled={new Date(2026, 7, 10)}
		hidden={new Date(2026, 7, 11)}
		showOutsideDays
	/>
}
