function Leaf(props: { v: string }) @{
	<em>{props.v}</em>
}

// The @if inside <em> claims its range and leaves the cursor after it, at the
// end of the root's children.
function Nested(props: { v: string }) @{
	<em>
		@if (props.v !== '') {
			<b>{props.v as string}</b>
		}
	</em>
}

function Empty() @{
	<></>
}

// Each client arm renders two components. The server rendered the other arm,
// whose first element has no component range around it.
export function IfArm(props: { on: boolean; z: string }) @{
	<div>
		@if (props.on) {
			<>
				<Leaf v="x" />
				<Leaf v={props.z} />
			</>
		} @else {
			<>
				<em>{'x' as string}</em>
				<Leaf v={props.z} />
			</>
		}
	</div>
}

export function SwitchArm(props: { on: boolean; z: string }) @{
	<div>
		@switch (props.on) {
			@case true: {
				<>
					<Leaf v="x" />
					<Leaf v={props.z} />
				</>
			}
			@default: {
				<>
					<em>{'x' as string}</em>
					<Leaf v={props.z} />
				</>
			}
		}
	</div>
}

export function NestedArm(props: { on: boolean; z: string }) @{
	<div>
		@if (props.on) {
			<>
				<Nested v="x" />
				<Leaf v={props.z} />
			</>
		} @else {
			<>
				<em>
					@if (!props.on) {
						<b>{'x' as string}</b>
					}
				</em>
				<Leaf v={props.z} />
			</>
		}
	</div>
}

// A component whose body is a branch with two roots.
function Pair(props: { shown: boolean }) @{
	@if (props.shown) {
		<>
			<em>{'x' as string}</em>
			<b>{'b' as string}</b>
		</>
	}
}

// The first component's branch has no server range either: its roots are the
// server arm's first two elements.
export function BranchArm(props: { on: boolean; shown: boolean; z: string }) @{
	<div>
		@if (props.on) {
			<>
				<Pair shown={props.shown} />
				<Leaf v={props.z} />
			</>
		} @else {
			<>
				<em>{'x' as string}</em>
				<b>{'b' as string}</b>
				<Leaf v={props.z} />
			</>
		}
	</div>
}

// The server's arm has no range for the second component.
export function ShortArm(props: { on: boolean; z: string }) @{
	<div>
		@if (props.on) {
			<>
				<Leaf v="x" />
				<Leaf v={props.z} />
			</>
		} @else {
			<>
				<em>{'x' as string}</em>
				<s>{'s' as string}</s>
			</>
		}
	</div>
}

// A component that renders nothing leaves the element to the next one.
export function EmptyFirstArm(props: { on: boolean; z: string }) @{
	<div>
		@if (props.on) {
			<>
				<Empty />
				<Leaf v="x" />
				<Leaf v={props.z} />
			</>
		} @else {
			<>
				<em>{'x' as string}</em>
				<Leaf v={props.z} />
			</>
		}
	</div>
}

export function Shown(props: { v: string }) @{
	<b>{props.v as string}</b>
}

// Returns a single-root component, which has no range of its own.
export function Maybe(props: { shown: boolean }) {
	return props.shown ? <Shown v="m" /> : undefined as never;
}

export function MaybeThenSibling(props: { shown: boolean }) @{
	<div>
		<Maybe shown={props.shown} />
		<p>{'p' as string}</p>
	</div>
}
