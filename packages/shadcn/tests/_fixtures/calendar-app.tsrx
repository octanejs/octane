// Calendar fixtures. Every case pins `defaultMonth` to January 2024 so nothing depends on the
// day the suite runs, and so "today" is provably outside the rendered month.
import { useState } from 'octane';
import { Calendar } from '@octanejs/shadcn/base-ui/Calendar';
import { Calendar as RadixCalendar } from '@octanejs/shadcn/Calendar';

const JANUARY_2024 = new Date(2024, 0, 1);
const iso = (date: Date | undefined) => (date ? date.toISOString().slice(0, 10) : 'none');

export function CalendarSingleFixture() @{
	const [selected, setSelected] = useState<Date | undefined>(undefined);
	const label = iso(selected);

	<div>
		<Calendar
			mode="single"
			defaultMonth={JANUARY_2024}
			selected={selected}
			onSelect={(date) => setSelected(date)}
		/>
		<output data-testid="selected">{label as string}</output>
	</div>
}

export function CalendarRangeFixture() @{
	<Calendar
		mode="range"
		defaultMonth={JANUARY_2024}
		selected={{ from: new Date(2024, 0, 10), to: new Date(2024, 0, 12) }}
	/>
}

export function CalendarDropdownFixture() @{
	<Calendar
		mode="single"
		captionLayout="dropdown"
		defaultMonth={JANUARY_2024}
		startMonth={new Date(2023, 0, 1)}
		endMonth={new Date(2025, 11, 31)}
	/>
}

export function CalendarWeekNumberFixture() @{
	<Calendar mode="single" showWeekNumber defaultMonth={JANUARY_2024} />
}

export function CalendarDisabledFixture() @{
	const [selected, setSelected] = useState<Date | undefined>(undefined);
	const label = iso(selected);

	<div>
		<Calendar
			mode="single"
			defaultMonth={JANUARY_2024}
			disabled={new Date(2024, 0, 15)}
			selected={selected}
			onSelect={(date) => setSelected(date)}
		/>
		<output data-testid="selected">{label as string}</output>
	</div>
}

export function CalendarOutsideDaysFixture() @{
	<Calendar mode="single" defaultMonth={JANUARY_2024} showOutsideDays={false} />
}

export function RadixCalendarFixture() @{
	const [selected, setSelected] = useState<Date | undefined>(undefined);
	const label = iso(selected);

	<div>
		<RadixCalendar
			mode="single"
			defaultMonth={JANUARY_2024}
			selected={selected}
			onSelect={(date) => setSelected(date)}
		/>
		<output data-testid="selected">{label as string}</output>
	</div>
}
