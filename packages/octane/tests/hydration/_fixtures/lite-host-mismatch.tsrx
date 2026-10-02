// A production compile memoizes a call whose output reads only constants in a
// full component slot. Reading the module `let` keeps these calls lite.
let label = 'p';

function Para() @{
	<p>{label as string}</p>
}

function Em() @{
	<em>{'e' as string}</em>
}

function Leaf() @{
	<b>{label as string}</b>
}

// The server's else arm renders an element where the client's then arm calls
// a lite component. The call renders into the arm's <section>, its lite host,
// which is not the parent of the arm's own range.
export function SectionArm(props: { on: boolean }) @{
	<div id="r">
		@if (props.on) {
			<section>
				<Em />
				<Para />
				<Leaf />
				<hr />
			</section>
		} @else {
			<section>
				<Em />
				<u>{'u' as string}</u>
				<Leaf />
				<hr />
			</section>
		}
	</div>
}

// The same calls in a fragment arm render into the arm's parent.
export function FragmentArm(props: { on: boolean }) @{
	<div id="r">
		@if (props.on) {
			<>
				<Em />
				<Para />
				<Leaf />
				<hr />
			</>
		} @else {
			<>
				<Em />
				<u>{'u' as string}</u>
				<Leaf />
				<hr />
			</>
		}
	</div>
}

// No call before Para moves the cursor into the <section>, so Para's template
// finds the cursor on its host.
export function HostCursor(props: { on: boolean }) @{
	<div id="r">
		@if (props.on) {
			<section>
				<hr />
				<Para />
				<s>{'s' as string}</s>
			</section>
		} @else {
			<section>
				<hr />
				<u>{'u' as string}</u>
				<s>{'s' as string}</s>
			</section>
		}
	</div>
}

// The node Para's template replaces is its host's last child.
export function LastChild(props: { on: boolean }) @{
	<div id="r">
		@if (props.on) {
			<section>
				<hr />
				<Em />
				<Para />
			</section>
		} @else {
			<section>
				<hr />
				<Em />
				<u>{'u' as string}</u>
			</section>
		}
	</div>
}
