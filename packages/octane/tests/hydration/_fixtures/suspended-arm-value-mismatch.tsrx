// A resolved @try arm whose first hydrating attempt repairs a text or
// attribute value that differs from the server's, and then suspends. The
// pending attempt must leave the server's value in place, and the attempt that
// commits must report the mismatch once.
function read(value: unknown): string {
	if (value !== undefined) throw value;
	return 'ok';
}

export const gate: { promise?: Promise<void> } = {};

function GateLeaf() @{
	<i>{read(gate.promise) as string}</i>
}

export function TextArm(props: { label: string }) @{
	<div>
		@try {
			<>
				<span>{props.label as string}</span>
				<GateLeaf />
			</>
		} @pending {
			<p>{'pending'}</p>
		}
	</div>
}

export function SiblingTextArm(props: { label: string }) @{
	<div>
		@try {
			<>
				<span>
					<u>{'x'}</u>
					{props.label as string}
				</span>
				<GateLeaf />
			</>
		} @pending {
			<p>{'pending'}</p>
		}
	</div>
}

export function AttributeArm(props: { label: string }) @{
	<div>
		@try {
			<>
				<span title={props.label}>{'t'}</span>
				<GateLeaf />
			</>
		} @pending {
			<p>{'pending'}</p>
		}
	</div>
}

export function StyleArm(props: { label: string }) @{
	<div>
		@try {
			<>
				<span style={{ color: props.label }}>{'t'}</span>
				<GateLeaf />
			</>
		} @pending {
			<p>{'pending'}</p>
		}
	</div>
}

export function ClassArm(props: { label: string }) @{
	<div>
		@try {
			<>
				<span class={props.label}>{'t'}</span>
				<GateLeaf />
			</>
		} @pending {
			<p>{'pending'}</p>
		}
	</div>
}

// The inner arm commits inside the outer arm's attempt, which then suspends.
export function NestedTextArm(props: { label: string }) @{
	<div>
		@try {
			<>
				@try {
					<span>{props.label as string}</span>
				} @pending {
					<b>{'inner pending'}</b>
				}
				<GateLeaf />
			</>
		} @pending {
			<p>{'pending'}</p>
		}
	</div>
}

export function NestedClassArm(props: { label: string }) @{
	<div>
		@try {
			<>
				@try {
					<span class={props.label}>{'t'}</span>
				} @pending {
					<b>{'inner pending'}</b>
				}
				<GateLeaf />
			</>
		} @pending {
			<p>{'pending'}</p>
		}
	</div>
}

// Raw HTML keeps the server's content, so every attempt that compares it
// finds the mismatch.
export function HtmlArm(props: { label: string }) @{
	<div>
		@try {
			<>
				<span dangerouslySetInnerHTML={{ __html: props.label }} />
				<GateLeaf />
			</>
		} @pending {
			<p>{'pending'}</p>
		}
	</div>
}

// The server rendered the other @if arm, so hydration rebuilds the `<span>`
// from the client template before the arm suspends.
export function RebuiltArm(props: { label: string }) @{
	<div>
		@try {
			<>
				@if (props.label === 'server') {
					<b>{'server'}</b>
				} @else {
					<span title={props.label}>{props.label as string}</span>
				}
				<GateLeaf />
			</>
		} @pending {
			<p>{'pending'}</p>
		}
	</div>
}

// The client removes a namespaced attribute that the server rendered.
export function XlinkArm(props: { label: string }) @{
	<div>
		@try {
			<>
				<svg>
					<use xlinkHref={props.label === 'server' ? '#server' : undefined} />
				</svg>
				<GateLeaf />
			</>
		} @pending {
			<p>{'pending'}</p>
		}
	</div>
}
