import type { ComponentBody } from 'octane';

function label(): string {
	return 'ok';
}

function Leaf() @{
	<i>{label() as string}</i>
}

function Bold() @{
	<b>{'b'}</b>
}

function Strike() @{
	<s>{'s'}</s>
}

// Each branch renders its `@else` arm on the client. The server renders the
// `@if` arm, whose content starts with what the `@else` arm renders and ends
// with a stale tail, so the client adopts the arm's range and leaves the tail.
export function SoleComponent(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<>
				<Leaf />
				<s class="foreign">{'f'}</s>
			</>
		} @else {
			<Leaf />
		}
	</div>
}

export function SingleRoot(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<>
				<i>{label() as string}</i>
				<s class="foreign">{'f'}</s>
			</>
		} @else {
			<i>{label() as string}</i>
		}
	</div>
}

// The stale tail ends with the same tag as the client's last root.
export function StaticFragment(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<>
				<i>{label() as string}</i>
				<b>{'b'}</b>
				<s class="foreign">{'f'}</s>
				<b class="foreign">{'b'}</b>
			</>
		} @else {
			<>
				<i>{label() as string}</i>
				<b>{'b'}</b>
			</>
		}
	</div>
}

export function HoleFragment(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<>
				<i>{label() as string}</i>
				<Bold />
				<s class="foreign">{'f'}</s>
			</>
		} @else {
			<>
				<i>{label() as string}</i>
				<Bold />
			</>
		}
	</div>
}

export function SwitchBranch(props: { server?: boolean }) @{
	<div>
		@switch (props.server ? 'server' : 'client') {
			@case 'server': {
				<>
					<i>{label() as string}</i>
					<s class="foreign">{'f'}</s>
				</>
			}
			@default: {
				<i>{label() as string}</i>
			}
		}
	</div>
}

// Both sides render the outer `@if` arm; only the inner arm leaves a tail.
export function NestedBranch(props: { server?: boolean }) @{
	<div>
		@if (true) {
			<>
				<Leaf />
				@if (props.server) {
					<>
						<b>{'b'}</b>
						<s class="foreign">{'f'}</s>
					</>
				} @else {
					<b>{'b'}</b>
				}
				<u>{'u'}</u>
			</>
		}
	</div>
}

// Only the outer arm leaves a tail, after an inner branch both sides render.
export function OuterBranch(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<>
				<Leaf />
				@if (true) {
					<b>{'b'}</b>
				}
				<u>{'u'}</u>
				<s class="foreign">{'f'}</s>
			</>
		} @else {
			<>
				<Leaf />
				@if (true) {
					<b>{'b'}</b>
				}
				<u>{'u'}</u>
			</>
		}
	</div>
}

// The client's last component finds the server's `<s>` where it expects its
// range and adopts it without one. That `<s>` is client content now.
export function UnframedComponent(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<>
				<Bold />
				<s>{'s'}</s>
				<u class="foreign">{'tail'}</u>
			</>
		} @else {
			<>
				<Bold />
				<Strike />
			</>
		}
	</div>
}

function Slot(props: { render: ComponentBody }) @{
	const Render = props.render;
	<section>
		<Render />
	</section>
}

// The branch sits in a template that a helper passed as a render prop returns.
export function HelperFragment(props: { server?: boolean }) @{
	const render = () => @{
		<div>
			@if (props.server) {
				<>
					<i>{label() as string}</i>
					<b>{'b'}</b>
					<s class="foreign">{'f'}</s>
				</>
			} @else {
				<>
					<i>{label() as string}</i>
					<b>{'b'}</b>
				</>
			}
		</div>
	};
	<Slot render={render} />
}
