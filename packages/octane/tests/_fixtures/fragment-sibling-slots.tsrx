// Sibling slots at the root of a fragment body: a component's root fragment, a
// directive arm, a @try body, or a @for row. The `a` slot comes first in source
// order, so its content must precede `b`'s whenever both render, however their
// arms changed to get there.

function IfPair(props: { a: boolean; b: boolean }) @{
	<>
		@if (props.a) {
			<span>{'a'}</span>
		}
		@if (props.b) {
			<span>{'b'}</span>
		}
	</>
}

export function ComponentRoot(props: { a: boolean; b: boolean }) @{
	<main>
		<IfPair a={props.a} b={props.b} />
	</main>
}

export function ArmFragment(props: { a: boolean; b: boolean; hidden?: boolean }) @{
	<main>
		@if (!props.hidden) {
			<>
				@if (props.a) {
					<span>{'a'}</span>
				}
				@if (props.b) {
					<span>{'b'}</span>
				}
			</>
		}
	</main>
}

export function TryBody(props: { a: boolean; b: boolean }) @{
	<main>
		@try {
			<>
				@if (props.a) {
					<span>{'a'}</span>
				}
				@if (props.b) {
					<span>{'b'}</span>
				}
			</>
		} @catch (error) {
			<p>{'failed'}</p>
		}
	</main>
}

export function ForRow(props: { a: boolean; b: boolean }) @{
	const rows = ['row'];
	<main>
		@for (const row of rows; key row) {
			<>
				@if (props.a) {
					<span>{'a'}</span>
				}
				@if (props.b) {
					<span>{'b'}</span>
				}
			</>
		}
	</main>
}

function SwitchPair(props: { a: boolean; b: boolean }) @{
	<>
		@switch (props.a) {
			@case true: {
				<span>{'a'}</span>
			}
		}
		@if (props.b) {
			<span>{'b'}</span>
		}
	</>
}

export function SwitchThenIf(props: { a: boolean; b: boolean }) @{
	<main>
		<SwitchPair a={props.a} b={props.b} />
	</main>
}

function OnlyA(props: { a: boolean }) @{
	@if (props.a) {
		<span>{'a'}</span>
	}
}

function OnlyB(props: { b: boolean }) @{
	@if (props.b) {
		<span>{'b'}</span>
	}
}

function ComponentPair(props: { a: boolean; b: boolean }) @{
	<>
		<OnlyA a={props.a} />
		<OnlyB b={props.b} />
	</>
}

export function ComponentSiblings(props: { a: boolean; b: boolean }) @{
	<main>
		<ComponentPair a={props.a} b={props.b} />
	</main>
}

// A @for keeps its own boundary even while empty, so it needs no anchor.
function ListPair(props: { a: boolean; b: boolean }) @{
	const items = props.a ? ['a'] : [];
	<>
		@for (const item of items; key item) {
			<span>{item as string}</span>
		}
		@if (props.b) {
			<span>{'b'}</span>
		}
	</>
}

export function ListThenIf(props: { a: boolean; b: boolean }) @{
	<main>
		<ListPair a={props.a} b={props.b} />
	</main>
}
