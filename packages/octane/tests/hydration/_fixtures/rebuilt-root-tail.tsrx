import { use, useState } from 'octane';

// Each client component renders a single root where the server rendered more
// in that component's range, from the same source, starting with an element
// of another tag than the root. In the last two exports, the client renders
// more of the range after that root.

function Em() @{
	<em>{'e'}</em>
}

function BoldThenEm() @{
	<>
		<b class="server">{'server'}</b>
		<em class="tail">{'tail'}</em>
	</>
}

function Para() @{
	<p>{'p'}</p>
}

function StatePara() @{
	const [value] = useState('p');
	<p>{value as string}</p>
}

// A lite component stands where the server rendered the other arm's first
// component.
export function Branch(props: { server?: boolean }) @{
	<section>
		@if (props.server) {
			<>
				<BoldThenEm />
				<Em />
			</>
		} @else {
			<>
				<Para />
				<Em />
			</>
		}
	</section>
}

// The same, for a component with hooks.
export function StateBranch(props: { server?: boolean }) @{
	<section>
		@if (props.server) {
			<>
				<BoldThenEm />
				<Em />
			</>
		} @else {
			<>
				<StatePara />
				<Em />
			</>
		}
	</section>
}

// A component whose identity differs between server and client.
export function DynamicIdentity(props: { server?: boolean }) {
	const Arm = props.server ? BoldThenEm : StatePara;
	return (
		<section>
			<Arm />
			<Em />
		</section>
	);
}

// A component whose identity differs on the client renders its template
// straight into the range of the hole it fills.
export function DynamicTemplate(props: { server?: boolean }) {
	const Arm = props.server ? BoldThenEm : Para;
	return (
		<section>
			<Arm />
			<Em />
		</section>
	);
}

// Hookless components in a renderable hole render in lite frames.
export function RenderableHole(props: { server?: boolean }) @{
	<section>
		{props.server ? <BoldThenEm /> : <Para />}
		<Em />
	</section>
}

function Returning(props: { server?: boolean }) {
	if (props.server)
		return (
			<>
				<b class="server">{'server'}</b>
				<em class="tail">{'tail'}</em>
			</>
		);
	return <p>{'p'}</p>;
}

// The client's return value renders into the range its component adopted.
export function ConditionalReturn(props: { server?: boolean }) @{
	<section>
		<Returning server={props.server} />
		<Em />
	</section>
}

// A keyed list item lends its range to the component it renders.
export function ListItem(props: { server?: boolean }) {
	const Item = props.server ? BoldThenEm : Para;
	return (
		<section>
			{[<Item key="item" />]}
			<Em />
		</section>
	);
}

function ParaCall() @{
	<Para />
}

// A component's only call inherits the component's range.
export function InheritedCall(props: { server?: boolean }) {
	const Arm = props.server ? BoldThenEm : ParaCall;
	return (
		<section>
			<Arm />
			<Em />
		</section>
	);
}

function Leaf(props: { value: Promise<string> }) @{
	<i>{use(props.value) as string}</i>
}

function SuspendedPara(props: { value: Promise<string> }) @{
	<p>
		<Leaf value={props.value} />
	</p>
}

// A child of the mismatched root suspends.
export function SuspendedBranch(props: { server?: boolean; value: Promise<string> }) @{
	<section>
		@try {
			@if (props.server) {
				<>
					<BoldThenEm />
					<Em />
				</>
			} @else {
				<>
					<SuspendedPara value={props.value} />
					<Em />
				</>
			}
		} @pending {
			<span>{'loading'}</span>
		}
	</section>
}

function BoldEmTail() @{
	<>
		<b class="server">{'server'}</b>
		<Em />
		<s class="tail">{'s'}</s>
	</>
}

function ParaEm() @{
	<>
		<Para />
		<Em />
	</>
}

// A later call has its own server range after the mismatched root.
export function ClaimedTail(props: { server?: boolean }) {
	const Arm = props.server ? BoldEmTail : ParaEm;
	return (
		<section>
			<Arm />
		</section>
	);
}

function BoldEmInline() @{
	<>
		<b class="server">{'server'}</b>
		<em>{'e'}</em>
		<s class="tail">{'s'}</s>
	</>
}

function ParaThenEm() @{
	<>
		<Para />
		<em>{'e'}</em>
	</>
}

// The range's template renders an element after the mismatched hole.
export function HoleThenElement(props: { server?: boolean }) {
	const Arm = props.server ? BoldEmInline : ParaThenEm;
	return (
		<section>
			<Arm />
		</section>
	);
}

// A branch the server rendered no range for stands over the first node of
// another arm's range.
export function MarkerlessRebuilt(props: { server?: boolean; inner?: boolean }) @{
	<section>
		@if (props.server) {
			<>
				<b class="server">{'server'}</b>
				<em>{'e'}</em>
			</>
		} @else {
			<>
				@if (props.inner) {
					<p>{'p'}</p>
				}
				<Em />
			</>
		}
	</section>
}
