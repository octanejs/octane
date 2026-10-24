// A stored element with a runtime-composed class reaches the de-opt renderer; in an
// @if arm its owner is the arm's lite stand-in rather than a Block (#2233).
export function StoredInArm(props: { h?: boolean; children?: any }) @{
	const node = <label className={['a']}>N</label>;
	@if (props.h) {
		<div>x</div>
	} @else {
		<div>
			{node}
			{props.children}
		</div>
	}
}

export function StoredInArmParent(props: { label: string }) @{
	<StoredInArm>
		<span>{props.label}</span>
	</StoredInArm>
}
