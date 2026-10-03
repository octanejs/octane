import { useState } from 'octane';

// The server rendered another component's raw markup in a component's range.
// The client's content there is a sequence of calls with no server ranges of
// their own, so each call adopts its server node in place. Whatever the server
// rendered after the last call's roots is stale.

function Para() @{
	<p>{'p'}</p>
}

function Em() @{
	<em>{'e'}</em>
}

function StatePara() @{
	const [value] = useState('p');
	<p>{value as string}</p>
}

function StateEm() @{
	const [value] = useState('e');
	<em>{value as string}</em>
}

function EmItalic() @{
	<>
		<em>{'e'}</em>
		<i>{'i'}</i>
	</>
}

function RawParaEm() @{
	<>
		<p>{'p'}</p>
		<em>{'e'}</em>
		<s class="tail">{'s'}</s>
	</>
}

function RawBoldEm() @{
	<>
		<b class="server">{'b'}</b>
		<em>{'e'}</em>
		<s class="tail">{'s'}</s>
	</>
}

function RawParaEmItalic() @{
	<>
		<p>{'p'}</p>
		<em>{'e'}</em>
		<i>{'i'}</i>
		<s class="tail">{'s'}</s>
	</>
}

function ParaEm() @{
	<>
		<Para />
		<Em />
	</>
}

function StateParaEm() @{
	<>
		<StatePara />
		<StateEm />
	</>
}

function ParaEmItalic() @{
	<>
		<Para />
		<EmItalic />
	</>
}

// Hookless calls in a component whose identity differs on the client.
export function InPlaceTail(props: { server?: boolean }) {
	const Arm = props.server ? RawParaEm : ParaEm;
	return <section>
		<Arm />
	</section>;
}

// Calls with hooks.
export function StateTail(props: { server?: boolean }) {
	const Arm = props.server ? RawParaEm : StateParaEm;
	return <section>
		<Arm />
	</section>;
}

// The last call adopts a fragment's roots in place.
export function FragmentTail(props: { server?: boolean }) {
	const Arm = props.server ? RawParaEmItalic : ParaEmItalic;
	return <section>
		<Arm />
	</section>;
}

// Hookless components in a renderable hole render in lite frames.
export function RenderableHole(props: { server?: boolean }) @{
	<section>
		{props.server ? <RawParaEm /> : <ParaEm />}
	</section>
}

// The first call rebuilds its root over the server's first node instead.
export function RebuiltFirst(props: { server?: boolean }) {
	const Arm = props.server ? RawBoldEm : ParaEm;
	return <section>
		<Arm />
	</section>;
}
