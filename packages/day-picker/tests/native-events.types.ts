import type { DayPickerProps, OnSelectHandler } from '../src/index.js';

export const callbacks: DayPickerProps = {
	mode: 'single',
	onDayClick: (_day, _modifiers, event) => {
		const nativeEvent: globalThis.MouseEvent = event;
		const button: HTMLButtonElement = event.currentTarget;
		// @ts-expect-error Octane delivers the native event itself, not a synthetic wrapper.
		void event.nativeEvent;
		void [nativeEvent, button];
	},
	onDayFocus: (_day, _modifiers, event) => {
		const nativeEvent: globalThis.FocusEvent = event;
		void nativeEvent;
	},
	onDayKeyDown: (_day, _modifiers, event) => {
		const nativeEvent: globalThis.KeyboardEvent = event;
		void nativeEvent;
	},
};

export const select: OnSelectHandler<Date | undefined> = (_selected, _date, _modifiers, event) => {
	const nativeEvent: globalThis.MouseEvent | globalThis.KeyboardEvent = event;
	// @ts-expect-error Native events do not have React's synthetic-event property.
	void event.nativeEvent;
	void nativeEvent;
};
