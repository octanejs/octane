import { type OctaneNode } from 'octane';

// A host whose only child is a renderable `{expr}` mounts that child without
// hydration markers on the client, with or without a spread. Textarea content
// is RCDATA, so any frame the server writes inside it becomes literal text.

export function SpreadTextarea(props: { value: OctaneNode; rest: Record<string, unknown> }) @{
	<section>
		<textarea {...props.rest}>{props.value}</textarea>
	</section>
}

export function DirectTextarea(props: { value: OctaneNode }) @{
	<section>
		<textarea name="body">{props.value}</textarea>
	</section>
}

export function SpreadTernaryTextarea(props: {
	on: boolean;
	value: OctaneNode;
	rest: Record<string, unknown>;
}) @{
	<section>
		<textarea {...props.rest}>{props.on ? props.value : 'fallback'}</textarea>
	</section>
}

// An option without a `value` is selected by its text, so the server can only
// project the select's default onto it when the label is unframed text.
export function SpreadOptionSelect(props: {
	selected: string;
	first: OctaneNode;
	second: OctaneNode;
	rest: Record<string, unknown>;
}) @{
	<select defaultValue={props.selected}>
		<option {...props.rest}>{props.first}</option>
		<option {...props.rest}>{props.second}</option>
	</select>
}
