import { createElement, type OctaneNode } from 'octane';
import type { SignalHandle } from 'octane/signals';

// Textarea content is RCDATA: the HTML parser keeps markup and comments inside
// it as literal text. Its children therefore fold into one text value on both
// sides, with no template placeholder and no server hydration marker.

// Parts may be signal handles. Typing them with the signals import opts this
// module's opaque holes into handle bindings.
type Part = string | number | SignalHandle<string> | OctaneNode;

export function MixedText(props: { value: Part }) @{
	<section>
		<textarea>hello {props.value as string}</textarea>
	</section>
}

export function MixedChild(props: { value: any }) @{
	<section>
		<textarea>hello {props.value}</textarea>
	</section>
}

export function TwoChildren(props: { value: Part; other: Part }) @{
	<section>
		<textarea>
			{props.value}
			{props.other}
		</textarea>
	</section>
}

export function SoleChild(props: { value: any }) @{
	<section>
		<textarea name="body">{props.value}</textarea>
	</section>
}

export function SpreadMixed(props: { value: any; rest: Record<string, unknown> }) @{
	<section>
		<textarea {...props.rest}>
			{'A: '}
			{props.value}
			!
		</textarea>
	</section>
}

export function ChildrenProp(props: { value: any }) @{
	<section>
		<textarea {...{ children: props.value }} />
	</section>
}

export function Descriptor(props: { value: any }) @{
	<section>{createElement('textarea', null, 'hello ', props.value)}</section>
}

export function DescriptorTag(props: { tag: string; value: any }) @{
	<section>{createElement(props.tag, null, 'hello ', props.value)}</section>
}

export function StoredJsx(props: { value: OctaneNode }) {
	const field = <textarea>hi {props.value}</textarea>;
	return <section>{field}</section>;
}
