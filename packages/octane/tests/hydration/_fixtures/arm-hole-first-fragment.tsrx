import { Suspense, type OctaneNode } from 'octane';

function Under(props: { v: string }) @{
	<u>{props.v as string}</u>
}

// Each client else-arm is a fragment whose first root is a hole. The server
// rendered the then-arm, which has no range at that hole.
export function ArmHoleFirst(props: { server?: boolean }) @{
	<section>
		@if (props.server) {
			<>
				<b class="server">{'server'}</b>
				<em>{'e'}</em>
			</>
		} @else {
			<>
				<Under v="z" />
				<i>{'x'}</i>
			</>
		}
	</section>
}

export function ShortArmHoleFirst(props: { server?: boolean }) @{
	<section>
		@if (props.server) {
			<b class="server">{'server'}</b>
		} @else {
			<>
				<Under v="z" />
				<i>{'x'}</i>
			</>
		}
	</section>
}

export function KeyedArmHoleFirst(props: { server?: boolean; k: string; tail: string }) @{
	<section>
		@if (props.server) {
			<>
				<b class="server">{'server'}</b>
				<em>{props.tail as string}</em>
			</>
		} @else {
			<>
				<Under key={props.k} v={props.k} />
				<i>{props.tail as string}</i>
			</>
		}
	</section>
}

// Hole-first fragments that the server rendered as well.
export function TextHoleFirst(props: { on: boolean; text: string }) @{
	<section>
		@if (props.on) {
			<>
				{props.text as string}
				<i>{'x'}</i>
			</>
		}
	</section>
}

export function NodeHoleFirst(props: { on: boolean; node: OctaneNode }) @{
	<section>
		@if (props.on) {
			<>
				{props.node}
				<i>{'x'}</i>
			</>
		}
	</section>
}

export function BlockHoleFirst(props: { on: boolean; flag: boolean }) @{
	<section>
		@if (props.on) {
			<>
				@if (props.flag) {
					<b>{'b'}</b>
				}
				<i>{'x'}</i>
			</>
		}
	</section>
}

export function TwoHolesFirst(props: { on: boolean; text: string }) @{
	<section>
		@if (props.on) {
			<>
				<Under v="z" />
				{props.text as string}
				<i>{'x'}</i>
			</>
		}
	</section>
}

export function TryHoleFirst(props: { on: boolean }) @{
	<section>
		@if (props.on) {
			<>
				@try {
					<Under v="z" />
				} @catch (error) {
					<p>{'caught'}</p>
				}
				<i>{'x'}</i>
			</>
		}
	</section>
}

export function SuspenseHoleFirst(props: { on: boolean }) @{
	<section>
		@if (props.on) {
			<>
				<Suspense fallback={<p>{'pending'}</p>}>
					<Under v="z" />
				</Suspense>
				<i>{'x'}</i>
			</>
		}
	</section>
}

function Pair() @{
	<>
		<s>{'s'}</s>
		<b>{'a'}</b>
	</>
}

// The client else-arm's hole holds an @if or @switch, and the server rendered
// the then-arm's plain hosts: the hole's walk finds the server's <s> where the
// slot's own range would be, and the arm's static <b> matches the server's <b>.
export function NestedIfHoleFirst(props: { server?: boolean; inner?: boolean }) @{
	<section>
		@if (props.server) {
			<>
				<s>{'s'}</s>
				<b>{'a'}</b>
			</>
		} @else {
			<>
				@if (props.inner) {
					<>
						<s>{'s'}</s>
						<b>{'a'}</b>
					</>
				}
				<b>{'a'}</b>
			</>
		}
		<em>{'e'}</em>
	</section>
}

export function NestedIfHoleMid(props: { server?: boolean; inner?: boolean }) @{
	<section>
		@if (props.server) {
			<>
				<i>{'i'}</i>
				<s>{'s'}</s>
				<b>{'a'}</b>
			</>
		} @else {
			<>
				<i>{'i'}</i>
				@if (props.inner) {
					<>
						<s>{'s'}</s>
						<b>{'a'}</b>
					</>
				}
				<b>{'a'}</b>
			</>
		}
		<em>{'e'}</em>
	</section>
}

export function NestedSwitchHoleFirst(props: { server?: boolean; inner?: string }) @{
	<section>
		@if (props.server) {
			<>
				<s>{'s'}</s>
				<b>{'a'}</b>
			</>
		} @else {
			<>
				@switch (props.inner) {
					@case 'pair': {
						<>
							<s>{'s'}</s>
							<b>{'a'}</b>
						</>
					}
					@case 's': {
						<s>{'s'}</s>
					}
					@case 'p': {
						<p>{'p'}</p>
					}
					@case 'component': {
						<Pair />
					}
				}
				<b>{'a'}</b>
			</>
		}
		<em>{'e'}</em>
	</section>
}
