import { useState } from 'octane';
import { Calendar } from '@octanejs/shadcn/Calendar';

const JANUARY_2024 = new Date(2024, 0, 1);

// `defaultMonth` is pinned so neither runtime's markup depends on the current date, and the
// day cells carry day-picker's own `data-day`, so the test addresses them without ids.
export function CalendarApp() @{
	const [selected, setSelected] = useState<Date | undefined>(undefined);

	<Calendar
		mode="single"
		defaultMonth={JANUARY_2024}
		selected={selected}
		onSelect={(date) => setSelected(date)}
	/>
}

export function CalendarDropdownApp() @{
	<Calendar
		mode="single"
		captionLayout="dropdown"
		defaultMonth={JANUARY_2024}
		startMonth={new Date(2023, 0, 1)}
		endMonth={new Date(2025, 11, 31)}
		showWeekNumber
	/>
}

export function CalendarRangeApp() @{
	<Calendar
		mode="range"
		defaultMonth={JANUARY_2024}
		selected={{ from: new Date(2024, 0, 10), to: new Date(2024, 0, 12) }}
	/>
}
