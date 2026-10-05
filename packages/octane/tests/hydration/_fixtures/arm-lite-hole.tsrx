function Under(props: { v: string }) @{
	<u>{props.v as string}</u>
}

function Pair(props: { v: string }) @{
	<>
		<Under v={props.v} />
		<Under v="q" />
	</>
}

function Frag(props: { v: string }) @{
	<>
		<u>{props.v as string}</u>
		<em>{'q'}</em>
	</>
}

// Each client arm has a component call at a `<!>` hole beside a static root
// that the server's other arm shares, so the client adopts the server arm's
// nodes through its fragment template. The server node at the hole is that
// arm's own element, not the component's range, and the component's body
// renders more than one root.
export function PairArm(props: { server?: boolean; tail: string }) @{
	<section>
		@if (props.server) {
			<>
				<b class="server">{'server'}</b>
				<i>{props.tail as string}</i>
			</>
		} @else {
			<>
				<Pair v="z" />
				<i>{props.tail as string}</i>
			</>
		}
	</section>
}

export function FragArm(props: { server?: boolean; tail: string }) @{
	<section>
		@if (props.server) {
			<>
				<b class="server">{'server'}</b>
				<i>{props.tail as string}</i>
			</>
		} @else {
			<>
				<Frag v="z" />
				<i>{props.tail as string}</i>
			</>
		}
	</section>
}

// The arms' shared root is a host element, so the call renders in the
// host's children while the arm's own range is the section's.
export function InHost(props: { server?: boolean; tail: string }) @{
	<section>
		@if (props.server) {
			<p>
				<b class="server">{'server'}</b>
				<i>{props.tail as string}</i>
			</p>
		} @else {
			<p>
				<Under v="z" />
				<i>{props.tail as string}</i>
			</p>
		}
	</section>
}

function Empty() @{
	<></>
}

// The call renders nothing, so nothing of its own takes the server node's place.
export function EmptyArm(props: { server?: boolean; tail: string }) @{
	<section>
		@if (props.server) {
			<>
				<b class="server">{'server'}</b>
				<i>{props.tail as string}</i>
			</>
		} @else {
			<>
				<Empty />
				<i>{props.tail as string}</i>
			</>
		}
	</section>
}

// The server node at the hole in the host matches the component's root.
export function InHostAdopt(props: { server?: boolean; tail: string }) @{
	<section>
		@if (props.server) {
			<p>
				<u>{'z'}</u>
				<i>{props.tail as string}</i>
			</p>
		} @else {
			<p>
				<Under v="z" />
				<i>{props.tail as string}</i>
			</p>
		}
	</section>
}
