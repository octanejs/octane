import type { OctaneNode } from 'octane';

// The server rendered another component's raw markup in a component's range.
// The client's content there is a sequence of calls with no server ranges of
// their own, and the last call adopts a fragment in place that holds a
// renderable hole. The server framed none of that markup, so what it rendered
// for a text hole is bare text, for an element hole that element, and for a
// null hole nothing at all.

type ArmProps = { text: string };

function Para() @{
	<p>{'p'}</p>
}

function EmText(props: ArmProps) @{
	<>
		<em>{'e'}</em>
		{props.text}
	</>
}

function EmTextItalic(props: ArmProps) @{
	<>
		<em>{'e'}</em>
		{props.text}
		<i>{'i'}</i>
	</>
}

function EmChild(props: { child: OctaneNode }) @{
	<>
		<em>{'e'}</em>
		{props.child}
	</>
}

function EmNull() @{
	<>
		<em>{'e'}</em>
		{null}
	</>
}

function RawText(_props: ArmProps) @{
	<>
		<p>{'p'}</p>
		<em>{'e'}</em>
		{'x'}
	</>
}

function RawTextTail(_props: ArmProps) @{
	<>
		<p>{'p'}</p>
		<em>{'e'}</em>
		{'x'}
		<s class="tail">{'s'}</s>
	</>
}

function RawTextItalic(_props: ArmProps) @{
	<>
		<p>{'p'}</p>
		<em>{'e'}</em>
		{'x'}
		<i>{'i'}</i>
	</>
}

function RawChild(_props: ArmProps) @{
	<>
		<p>{'p'}</p>
		<em>{'e'}</em>
		<b>{'x'}</b>
	</>
}

function RawEmTail(_props: ArmProps) @{
	<>
		<p>{'p'}</p>
		<em>{'e'}</em>
		<s class="tail">{'s'}</s>
	</>
}

function TextCalls(props: ArmProps) @{
	<>
		<Para />
		<EmText text={props.text} />
	</>
}

function TextItalicCalls(props: ArmProps) @{
	<>
		<Para />
		<EmTextItalic text={props.text} />
	</>
}

function ChildCalls(props: ArmProps) @{
	<>
		<Para />
		<EmChild child={<b>{props.text}</b>} />
	</>
}

function NullCalls(_props: ArmProps) @{
	<>
		<Para />
		<EmNull />
	</>
}

type Props = { server?: boolean; text?: string };

// The trailing hole adopts the server's bare text.
export function TextHole(props: Props) {
	const Arm = props.server ? RawText : TextCalls;
	return <section>
		<Arm text={props.text ?? 'x'} />
	</section>;
}

// A static root follows the hole.
export function TextHoleRoot(props: Props) {
	const Arm = props.server ? RawTextItalic : TextItalicCalls;
	return <section>
		<Arm text={props.text ?? 'x'} />
	</section>;
}

// The hole's value is an element.
export function ElementHole(props: Props) {
	const Arm = props.server ? RawChild : ChildCalls;
	return <section>
		<Arm text={props.text ?? 'x'} />
	</section>;
}

export function TextHoleTail(props: Props) {
	const Arm = props.server ? RawTextTail : TextCalls;
	return <section>
		<Arm text={props.text ?? 'x'} />
	</section>;
}

// The null hole meets the server node after the fragment.
export function NullHoleTail(props: Props) {
	const Arm = props.server ? RawEmTail : NullCalls;
	return <section>
		<Arm text={props.text ?? 'x'} />
	</section>;
}
