import { useState } from 'octane';

// Each component renders less on the client than on the server, from the same
// source. The server's component frame starts with what the client renders and
// ends with a stale tail, so the client adopts the frame and leaves the tail.

function ServerArm() {
	const [value] = useState('ok');
	return (
		<>
			<i>{value as string}</i>
			<s class="foreign">{'f'}</s>
		</>
	);
}

function ClientArm() {
	const [value] = useState('ok');
	return <i>{value as string}</i>;
}

// A component whose identity differs between server and client renders in a
// full component frame.
export function DynamicIdentity(props: { server?: boolean }) {
	const Arm = props.server ? ServerArm : ClientArm;
	return (
		<div>
			<Arm />
			<p>{'after'}</p>
		</div>
	);
}

function LiteServer() @{
	<>
		<i>{'ok'}</i>
		<s class="foreign">{'f'}</s>
	</>
}

function LiteClient() @{
	<i>{'ok'}</i>
}

// Hookless components in a renderable hole render in lite frames.
export function RenderableHole(props: { server?: boolean }) @{
	<div>
		{props.server ? <LiteServer /> : <LiteClient />}
		<p>{'after'}</p>
	</div>
}

// A component whose identity differs on the client renders its template
// straight into the range of the hole it fills.
export function DynamicTemplate(props: { server?: boolean }) {
	const Arm = props.server ? LiteServer : LiteClient;
	return (
		<div>
			<Arm />
			<p>{'after'}</p>
		</div>
	);
}

function Returning(props: { server?: boolean }) {
	if (props.server)
		return (
			<>
				<i>{'ok'}</i>
				<s class="foreign">{'f'}</s>
			</>
		);
	return <i>{'ok'}</i>;
}

// The client's return value renders into the range its component adopted.
export function ConditionalReturn(props: { server?: boolean }) @{
	<div>
		<Returning server={props.server} />
		<p>{'after'}</p>
	</div>
}

// A keyed list item lends its range to the component it renders.
export function ListItem(props: { server?: boolean }) {
	const Item = props.server ? LiteServer : LiteClient;
	return (
		<div>
			{[<Item key="item" />]}
			<p>{'after'}</p>
		</div>
	);
}

function ServerPair() @{
	<>
		<i>{'ok'}</i>
		<b>{'b'}</b>
	</>
}

function ServerShape() @{
	<>
		<i>{'ok'}</i>
		<b>{'b'}</b>
		<s class="foreign">{'f'}</s>
	</>
}

function ClientShape(props: { inner?: boolean }) @{
	@if (props.inner) {
		<>
			<i>{'ok'}</i>
			<b>{'b'}</b>
		</>
	}
}

// A component whose identity differs on the client, and whose body is a
// branch the server rendered no range for: the branch's template adopts the
// frame's first hosts in place.
export function BranchBody(props: { server?: 'tail' | 'same'; inner?: boolean }) {
	const Shape =
		props.server === 'tail' ? ServerShape : props.server === 'same' ? ServerPair : ClientShape;
	return (
		<div>
			<Shape inner={props.inner} />
			<p>{'after'}</p>
		</div>
	);
}
