function Under(props: { v: string }) @{
	<u>{props.v as string}</u>
}

function Over(props: { v: string }) @{
	<s>{props.v as string}</s>
}

// Each client arm has a component call at a `<!>` hole beside static roots
// that the server's other arm shares, so the client adopts the server arm's
// nodes through its fragment template. The server node at the hole is that
// arm's own element, not the component's range.
export function SharedTail(props: { server?: boolean; tail: string }) @{
	<section>
		@if (props.server) {
			<>
				<b class="server">{'server'}</b>
				<i>{props.tail as string}</i>
			</>
		} @else {
			<>
				<Under v="z" />
				<i>{props.tail as string}</i>
			</>
		}
	</section>
}

export function Keyed(props: { server?: boolean; k: string; tail: string }) @{
	<section>
		@if (props.server) {
			<>
				<b class="server">{'server'}</b>
				<i>{props.tail as string}</i>
			</>
		} @else {
			<>
				<Under key={props.k} v={props.k} />
				<i>{props.tail as string}</i>
			</>
		}
	</section>
}

// The keyed call follows the shared root, where the cursor still rests.
export function KeyedLast(props: { server?: boolean; k: string; tail: string }) @{
	<section>
		@if (props.server) {
			<>
				<i>{props.tail as string}</i>
				<b class="server">{'server'}</b>
			</>
		} @else {
			<>
				<i>{props.tail as string}</i>
				<Under key={props.k} v={props.k} />
			</>
		}
	</section>
}

export function Dynamic(props: { server?: boolean; over?: boolean; tail: string }) @{
	const C = props.over ? Over : Under;
	<section>
		@if (props.server) {
			<>
				<b class="server">{'server'}</b>
				<i>{props.tail as string}</i>
			</>
		} @else {
			<>
				<C v="z" />
				<i>{props.tail as string}</i>
			</>
		}
	</section>
}

export function HoleLast(props: { server?: boolean; tail: string }) @{
	<section>
		@if (props.server) {
			<>
				<i>{props.tail as string}</i>
				<b class="server" />
			</>
		} @else {
			<>
				<i>{props.tail as string}</i>
				<Under v="z" />
			</>
		}
	</section>
}

export function TwoHoles(props: { server?: boolean; tail: string }) @{
	<section>
		@if (props.server) {
			<>
				<i>{props.tail as string}</i>
				<b class="server">{'server'}</b>
				<b class="server">{'server'}</b>
			</>
		} @else {
			<>
				<i>{props.tail as string}</i>
				<Under v="y" />
				<Under v="z" />
			</>
		}
	</section>
}

// The server node at the hole matches the component's root.
export function AdoptLast(props: { server?: boolean; tail: string }) @{
	<section>
		@if (props.server) {
			<>
				<i>{props.tail as string}</i>
				<u>{'z'}</u>
			</>
		} @else {
			<>
				<i>{props.tail as string}</i>
				<Under v="z" />
			</>
		}
	</section>
}

// The call is the arm's sole content, so its anchor is the arm's end marker
// and the server's other arm after the rebuilt root is stale.
export function SoleHole(props: { server?: boolean; tail: string }) @{
	<section>
		@if (props.server) {
			<>
				<b class="server">{'server'}</b>
				<em class="server">{props.tail as string}</em>
			</>
		} @else {
			<Under v="z" />
		}
	</section>
}
