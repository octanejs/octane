import { Children, descriptorChildren } from 'octane';

type Inspect = (children: unknown[]) => void;

// Reports the flattened children it receives, then renders them unchanged.
const Inspector = descriptorChildren(function Inspector(props: {
	children?: unknown;
	inspect: Inspect;
}) {
	props.inspect(Children.toArray(props.children));
	return props.children;
});

export function Item(props: { value: string }) @{
	<span class="item">{props.value}</span>
}

export function IfChildren(props: { shown: boolean; other: boolean; inspect: Inspect }) @{
	<Inspector inspect={props.inspect}>
		<b />
		@if (props.shown) {
			<i />
		} @else if (props.other) {
			<s />
		}
		{props.shown && <u />}
	</Inspector>
}

export function ForChildren(props: { ids: string[]; inspect: Inspect }) @{
	<Inspector inspect={props.inspect}>
		@for (const id of props.ids; key id) {
			<Item value={id} />
		}
	</Inspector>
}

// Items nested in a host, as a menu's options sit inside its content part.
export function NestedForChildren(props: { ids: string[]; inspect: Inspect }) @{
	<Inspector inspect={props.inspect}>
		<section>
			@for (const id of props.ids; index position) {
				@if (position > 0) {
					<Item value={id} />
				}
			}
		</section>
	</Inspector>
}

// The same nested @if with a header key, which authoring rules recommend.
export function KeyedNestedForChildren(props: { ids: string[]; inspect: Inspect }) @{
	<Inspector inspect={props.inspect}>
		<section>
			@for (const id of props.ids; index position; key id) {
				@if (position > 0) {
					<Item value={id} />
				}
			}
		</section>
	</Inspector>
}

// A marked Select that filters options with @if inside a keyed @for.
export function KeyedIfForChildren(props: {
	items: { id: string; ok: boolean }[];
	inspect: Inspect;
}) @{
	<Inspector inspect={props.inspect}>
		@for (const item of props.items; key item.id) {
			@if (item.ok) {
				<Item value={item.id} />
			}
		}
	</Inspector>
}

export function KeyedFragmentForChildren(props: { ids: string[]; inspect: Inspect }) @{
	<Inspector inspect={props.inspect}>
		@for (const id of props.ids; key id) {
			<>
				<Item value={id} />
			</>
		}
	</Inspector>
}

export function KeyedNestedListForChildren(props: {
	groups: { id: string; ids: string[] }[];
	inspect: Inspect;
}) @{
	<Inspector inspect={props.inspect}>
		@for (const group of props.groups; key group.id) {
			@for (const id of group.ids) {
				<Item value={id} />
			}
		}
	</Inspector>
}

// An arm with setup owns a render scope, so it stays one compiled fragment.
export function SetupArmChildren(props: { shown: boolean; inspect: Inspect }) @{
	<Inspector inspect={props.inspect}>
		@if (props.shown) {
			const label = 'setup';
			<i>{label}</i>
		}
	</Inspector>
}
