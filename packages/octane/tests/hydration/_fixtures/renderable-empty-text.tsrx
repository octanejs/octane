// A renderable `{expr}` hole that is its host's only child, whose server value
// was text but whose client value renders nothing. Both sides serialize every
// empty value as no children, so hydration must discard the server text.
import { Hydrate, type OctaneNode } from 'octane';
import type { HydrationStrategy } from 'octane/hydration';

type Kind = 'text' | 'undefined' | 'false' | 'true' | 'empty' | null;

interface HoleProps {
	kind: Kind;
	v: string;
	tail: OctaneNode;
}

function pick(kind: Kind, v: string): OctaneNode {
	switch (kind) {
		case 'text':
			return v;
		case 'undefined':
			return undefined;
		case 'false':
			return false;
		case 'true':
			return true;
		case 'empty':
			return '';
		default:
			return null;
	}
}

// The trailing hole hydrates after the first, so it fails if the first one's
// recovery gives up on the rest of the root.
export function Hole(props: HoleProps) @{
	<section>
		<div>{pick(props.kind, props.v)}</div>
		<b>{props.tail}</b>
	</section>
}

export function NestedHole(props: HoleProps) @{
	<main>
		<Hole kind={props.kind} v={props.v} tail={props.tail} />
	</main>
}

// A direct-host row inlines its binding guards rather than calling the
// cached-value update helper.
export function ListHole(props: { rows: { id: number; label: OctaneNode }[] }) @{
	<ul>
		@for (const row of props.rows; key row.id) {
			<li>{row.label}</li>
		}
	</ul>
}

export function DormantHole(props: { when: HydrationStrategy; kind: Kind; v: string }) @{
	<main>
		<Hydrate when={props.when} split={false}>
			<section>
				<div>{pick(props.kind, props.v)}</div>
			</section>
		</Hydrate>
	</main>
}
