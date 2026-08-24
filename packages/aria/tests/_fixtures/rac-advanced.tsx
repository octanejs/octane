import { createCalendar, parseDate } from '@internationalized/date';
import { useRef } from 'octane';

import {
	Button,
	Calendar,
	CalendarCell,
	CalendarGrid,
	ColorField,
	DateField,
	DateInput,
	DateSegment,
	DropZone,
	FileTrigger,
	Heading,
	Input,
	Label,
	useListData,
} from '../../src/components';
import { useDateField } from '../../src/datepicker/useDateField';
import { useDateSegment } from '../../src/datepicker/useDateSegment';
import type {
	DateFieldState,
	DateSegment as DateSegmentValue,
} from '../../src/stately/datepicker/useDateFieldState';
import { useDateFieldState } from '../../src/stately/datepicker/useDateFieldState';

export function CalendarScenario(props: { onChange?: (value: unknown) => void }) {
	return (
		<Calendar
			aria-label="Appointment date"
			defaultValue={parseDate('2026-08-18')}
			onChange={props.onChange}
		>
			<header>
				<Button slot="previous">Previous</Button>
				<Heading />
				<Button slot="next">Next</Button>
			</header>
			<CalendarGrid>{(date) => <CalendarCell date={date} />}</CalendarGrid>
		</Calendar>
	);
}

export function DateFieldScenario() {
	return (
		<DateField defaultValue={parseDate('2026-08-18')}>
			<Label>Birth date</Label>
			<DateInput>{(segment) => <DateSegment segment={segment} />}</DateInput>
		</DateField>
	);
}

function DateSegmentPropsScenarioItem(props: { segment: DateSegmentValue; state: DateFieldState }) {
	const ref = useRef<HTMLSpanElement | null>(null);
	const { segmentProps } = useDateSegment(props.segment, props.state, ref);
	return (
		<span
			ref={ref}
			data-segment-type={props.segment.type}
			data-enter-key-hint-prop={
				Object.prototype.hasOwnProperty.call(segmentProps, 'enterKeyHint') ? 'true' : 'false'
			}
		>
			{props.segment.text}
		</span>
	);
}

export function DateSegmentPropsScenario() {
	const ref = useRef<HTMLDivElement | null>(null);
	const state = useDateFieldState({
		locale: 'en-US',
		createCalendar,
		defaultValue: parseDate('2026-08-18'),
	});
	const { fieldProps } = useDateField({ 'aria-label': 'Birth date' }, state, ref);
	return (
		<div {...fieldProps} ref={ref}>
			{state.segments.map((segment, index) => (
				<DateSegmentPropsScenarioItem key={index} segment={segment} state={state} />
			))}
		</div>
	);
}

export function ColorFieldScenario(props: { onChange?: (value: unknown) => void }) {
	return (
		<ColorField defaultValue="#ff0" onChange={props.onChange}>
			<Label>Primary color</Label>
			<Input />
		</ColorField>
	);
}

export function FileTriggerScenario(props: { onSelect?: (files: FileList | null) => void } = {}) {
	return (
		<FileTrigger
			acceptedFileTypes={['image/png', 'image/jpeg']}
			allowsMultiple
			acceptDirectory
			onSelect={props.onSelect}
		>
			<Button>Choose files</Button>
		</FileTrigger>
	);
}

export function DropZoneScenario() {
	return <DropZone aria-label="Upload files">Drop files here</DropZone>;
}

export function ListDataScenario() {
	const data = useListData({
		initialItems: [
			{ id: 'a', name: 'Alpha' },
			{ id: 'b', name: 'Beta' },
		],
	});

	return (
		<div>
			<button id="append-item" onClick={() => data.append({ id: 'c', name: 'Gamma' })}>
				append
			</button>
			<button id="remove-item" onClick={() => data.remove('a')}>
				remove
			</button>
			<output data-testid="items">{data.items.map((item) => item.name).join(',')}</output>
		</div>
	);
}
