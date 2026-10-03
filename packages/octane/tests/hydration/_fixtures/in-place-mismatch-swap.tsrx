import { Callee } from './in-place-mismatch-swap-callee.tsrx';

// Each client arm calls the imported `Callee` where the server's arm rendered
// something else, with no component range around it. The call renders its one
// root over the server's node there, and a later render can swap the callee.

export function Swap(props: { on: boolean; n: string }) @{
	<div id="r">
		@try {
			@if (props.on) {
				<section title={props.n}>
					<hr />
					<Callee />
					<hr />
				</section>
			} @else {
				<section title={props.n}>
					<hr />
					<u>{'u' as string}</u>
					<hr />
				</section>
			}
		} @pending {
			<i>{'loading'}</i>
		}
	</div>
}

// The call is its host's last child.
export function SwapLast(props: { on: boolean; n: string }) @{
	<div id="r">
		@try {
			@if (props.on) {
				<section title={props.n}>
					<hr />
					<Callee />
				</section>
			} @else {
				<section title={props.n}>
					<hr />
					<u>{'u' as string}</u>
				</section>
			}
		} @pending {
			<i>{'loading'}</i>
		}
	</div>
}

// The call is the last root of an arm's fragment.
export function SwapArm(props: { on: boolean; n: string }) @{
	<section title={props.n}>
		@try {
			@if (props.on) {
				<>
					<hr />
					<Callee />
				</>
			} @else {
				<>
					<hr />
					<u>{'u' as string}</u>
				</>
			}
		} @pending {
			<i>{'loading'}</i>
		}
	</section>
}

// The server's arm also rendered a node after the one the call replaces.
export function SwapArmExtra(props: { on: boolean; n: string }) @{
	<section title={props.n}>
		@try {
			@if (props.on) {
				<>
					<hr />
					<Callee />
				</>
			} @else {
				<>
					<hr />
					<u>{'u' as string}</u>
					<b>{'extra' as string}</b>
				</>
			}
		} @pending {
			<i>{'loading'}</i>
		}
	</section>
}

// The server's arm rendered a <p> where the call is, so the callee's root
// adopts it in place.
export function SwapInPlace(props: { on: boolean; n: string }) @{
	<div id="r">
		@try {
			@if (props.on) {
				<section title={props.n}>
					<hr />
					<Callee />
					<hr />
				</section>
			} @else {
				<section title={props.n}>
					<hr />
					<p>{'x' as string}</p>
					<hr />
				</section>
			}
		} @pending {
			<i>{'loading'}</i>
		}
	</div>
}
