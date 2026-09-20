import { Activity } from 'octane';

interface LabelProps {
	text: string;
}

export function NativeLabel(props: LabelProps) @{
	<span>{props.text as string}</span>
}

export function ConditionalLabel(props: LabelProps & { alternate: boolean }) @{
	<>
		@if (props.alternate) {
			<strong>{props.text as string}</strong>
		} @else {
			<span>{props.text as string}</span>
		}
	</>
}

export function SelectedLabel(props: LabelProps & { alternate: boolean }) @{
	<>
		@switch (props.alternate) {
			@case true: {
				<strong>{props.text as string}</strong>
			}
			@default: {
				<span>{props.text as string}</span>
			}
		}
	</>
}

export function MappedLabels(props: { rows: { id: number; text: string }[] }) @{
	<>
		{props.rows.map((row) => <span key={row.id} data-row={row.id}>{row.text as string}</span>)}
	</>
}

export function VisibleLabel(props: LabelProps) @{
	<Activity mode="visible">
		<span>{props.text as string}</span>
	</Activity>
}
