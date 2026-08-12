import type { DayPickerProps } from '../types/index.js';

/** Extract the public `data-` attributes and DayPicker configuration flags. */
export function getDataAttributes(props: DayPickerProps): Record<string, unknown> {
	const dataAttributes: Record<string, unknown> = {
		'data-mode': props.mode ?? undefined,
		'data-required': 'required' in props ? props.required : undefined,
		'data-multiple-months': (props.numberOfMonths && props.numberOfMonths > 1) || undefined,
		'data-week-numbers': props.showWeekNumber || undefined,
		'data-broadcast-calendar': props.broadcastCalendar || undefined,
		'data-nav-layout': props.navLayout || undefined,
	};
	Object.entries(props).forEach(([key, value]) => {
		if (key.startsWith('data-')) dataAttributes[key] = value;
	});
	return dataAttributes;
}
