import { createElement, useState, type ComponentType, type OctaneNode } from 'octane';

// Two roots, so each instance needs a component range of its own.
function Tally(props: { name: string }) @{
	const [n, setN] = useState(0);
	<>
		<button class={props.name} onClick={() => setN(n + 1)}>{props.name + ':' + n}</button>
		<small class={props.name}>{props.name as string}</small>
	</>
}

function Wrapper() @{
	<>
		<Tally name="inner" />
		<Tally name="inner2" />
	</>
}

function hole(label: string): OctaneNode {
	return label === 'server' ? 'server' : createElement(Wrapper, {});
}

// The server renders text in the hole, where the client renders a component
// whose two calls each need a range the server never rendered.
export function HoleSwap(props: { label: string }) @{
	<section>
		{hole(props.label)}
		<Tally name="after" />
	</section>
}

// Hookless, so it clones its fragment in its caller's range.
function Plain(props: { name: string }) @{
	<>
		<b class={props.name}>{props.name as string}</b>
		<small class={props.name}>{props.name as string}</small>
	</>
}

function Single() @{
	<i>{'single'}</i>
}

function TallyThenPlain() @{
	<>
		<Tally name="inner" />
		<Plain name="inner2" />
	</>
}

function PlainThenTally() @{
	<>
		<Plain name="inner" />
		<Tally name="inner2" />
	</>
}

function TallyThenSingle() @{
	<>
		<Tally name="inner" />
		<Single />
	</>
}

function SingleThenTally() @{
	<>
		<Single />
		<Tally name="inner" />
	</>
}

function TallyThenIf() @{
	<>
		<Tally name="inner" />
		@if (true) {
			<s>{'on'}</s>
		}
	</>
}

const CONTENT: Record<string, ComponentType<{}>> = {
	Wrapper,
	TallyThenPlain,
	PlainThenTally,
	TallyThenSingle,
	SingleThenTally,
	TallyThenIf,
};

// A component named by `value`, or else `value` itself as text.
function content(value: string): OctaneNode {
	const component = CONTENT[value];
	return component === undefined ? value : createElement(component, {});
}

export function Content(props: { value: string }) @{
	<section>
		{content(props.value)}
		<Tally name="after" />
	</section>
}

// The hole is part of the root component's own output.
export function RootContent(props: { value: string }) @{
	<>
		{content(props.value)}
		<Tally name="after" />
	</>
}

export function Arm(props: { server: boolean }) @{
	<section>
		@if (props.server) {
			<b class="server">{'server'}</b>
		} @else {
			<>
				<Tally name="inner" />
				<Tally name="inner2" />
			</>
		}
		<Tally name="after" />
	</section>
}

// Two holes whose server text the client replaces: two ranges, two recoveries.
export function TwoHoles(props: { first: string; second: string }) @{
	<section>
		{content(props.first)}
		{content(props.second)}
		<Tally name="after" />
	</section>
}
