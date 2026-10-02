// A component call that finds no server range of its own renders on the client
// and discards the server nodes in its place. A server range after those nodes
// belongs to a later sibling call, which must still be able to adopt it.
import { useEffect } from 'octane';

interface Props {
	on: boolean;
	log: string[];
}

function Leaf(props: { v: string }) @{
	<em>{props.v}</em>
}

// Each effect keeps both compiles from lowering the call to a markerless lite
// component, so the client expects a server range for it.
function Empty(props: { log: string[] }) @{
	useEffect(() => {
		props.log.push('Empty');
	});
	<></>
}

function Pair(props: { log: string[] }) @{
	useEffect(() => {
		props.log.push('Pair');
	});
	<>
		<i>{'a'}</i>
		<i>{'b'}</i>
	</>
}

// Hookless with one root element, so the development compile lowers an
// anchorless call to it to a lite component.
function Tag() @{
	<b>{'t'}</b>
}

// The server renders each `@else` arm and the client the first arm, so the
// server has plain elements where the client calls Empty, Pair or Tag.
export function EmptyFirst(props: Props) @{
	<div>
		@if (props.on) {
			<>
				<Empty log={props.log} />
				<Leaf v="x" />
				<Leaf v="z" />
			</>
		} @else {
			<>
				<em>{'x' as string}</em>
				<Leaf v="z" />
			</>
		}
	</div>
}

export function EmptyThenRange(props: Props) @{
	<div>
		@if (props.on) {
			<>
				<Empty log={props.log} />
				<Leaf v="z" />
			</>
		} @else {
			<>
				<em>{'x' as string}</em>
				<Leaf v="z" />
			</>
		}
	</div>
}

export function PairThenRange(props: Props) @{
	<div>
		@if (props.on) {
			<>
				<Pair log={props.log} />
				<Leaf v="z" />
			</>
		} @else {
			<>
				<em>{'x' as string}</em>
				<b>{'y' as string}</b>
				<Leaf v="z" />
			</>
		}
	</div>
}

// Every child of the client's `<section>` is a component call.
export function HostEmptyFirst(props: Props) @{
	<div>
		@if (props.on) {
			<section>
				<Empty log={props.log} />
				<Leaf v="z" />
			</section>
		} @else {
			<section>
				<em>{'x' as string}</em>
				<Leaf v="z" />
			</section>
		}
	</div>
}

export function HostLiteFirst(props: Props) @{
	<div>
		@if (props.on) {
			<section>
				<Tag />
				<Leaf v="z" />
			</section>
		} @else {
			<section>
				<em>{'x' as string}</em>
				<Leaf v="z" />
			</section>
		}
	</div>
}
