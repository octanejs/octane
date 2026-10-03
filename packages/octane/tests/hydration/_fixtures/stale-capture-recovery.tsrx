import { Hydrate, createElement, useState, type OctaneNode } from 'octane';
import { condition } from 'octane/hydration';

// Each Dormant* boundary stays dormant until its captures change, so the server
// HTML it activates over predates the client's state. Each Plain* twin renders
// the same tree without a boundary, so its mismatch is a real one.

function Leaf(props: { name: string }) @{
	const [name] = useState(props.name);
	<>
		<b>{name as string}</b>
		<i>{name as string}</i>
	</>
}

function Pair() @{
	<>
		<Leaf name="x" />
		<Leaf name="y" />
	</>
}

function hole(label: string): OctaneNode {
	return label === 'server' ? 'server' : createElement(Pair, {});
}

function list(items: string[]): OctaneNode {
	return createElement('ul', null, items.map((item) => createElement('li', { key: item }, item)));
}

// A hole whose server text becomes a component that returns a fragment.
export function DormantHole(props: { label: string }) @{
	<div>
		<Hydrate split={false} when={condition(false)}>
			<section>
				{hole(props.label)}
				<Leaf name="z" />
			</section>
		</Hydrate>
	</div>
}

export function PlainHole(props: { label: string }) @{
	<div>
		<section>
			{hole(props.label)}
			<Leaf name="z" />
		</section>
	</div>
}

// A createElement list whose server rendered more children.
export function DormantList(props: { items: string[] }) @{
	<div>
		<Hydrate split={false} when={condition(false)}>
			<section>{list(props.items)}</section>
		</Hydrate>
	</div>
}

export function PlainList(props: { items: string[] }) @{
	<div>
		<section>{list(props.items)}</section>
	</div>
}

// A dynamic host tag that changed.
export function DormantTag(props: { tag: string }) @{
	const Tag = props.tag as any;
	<div>
		<Hydrate split={false} when={condition(false)}>
			<section>
				<Tag>{'t'}</Tag>
			</section>
		</Hydrate>
	</div>
}

export function PlainTag(props: { tag: string }) @{
	const Tag = props.tag as any;
	<div>
		<section>
			<Tag>{'t'}</Tag>
		</section>
	</div>
}

export function DormantHTML(props: { html: string }) @{
	<div>
		<Hydrate split={false} when={condition(false)}>
			<section>
				<article dangerouslySetInnerHTML={{ __html: props.html }} />
				<em>{props.html as string}</em>
			</section>
		</Hydrate>
	</div>
}

export function PlainHTML(props: { html: string }) @{
	<div>
		<section>
			<article dangerouslySetInnerHTML={{ __html: props.html }} />
		</section>
	</div>
}

export function DormantSuppressed(props: { v: string }) @{
	<div>
		<Hydrate split={false} when={condition(false)}>
			<section>
				<em
					suppressHydrationWarning
					title={props.v}
					class={props.v}
					style={{ color: props.v }}
				>{props.v as string}</em>
				<i title={props.v} class={props.v} style={{ color: props.v }}>{props.v as string}</i>
			</section>
		</Hydrate>
	</div>
}

export function PlainSuppressed(props: { v: string }) @{
	<div>
		<section>
			<em
				suppressHydrationWarning
				title={props.v}
				class={props.v}
				style={{ color: props.v }}
			>{props.v as string}</em>
		</section>
	</div>
}
