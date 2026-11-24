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

// Rows whose own `key` carries no value, so the header key identifies them.
export function ValuelessKeyRows(props: { ids: string[]; inspect: Inspect }) @{
	<Inspector inspect={props.inspect}>
		@for (const id of props.ids; key id) {
			<Item key value={id} />
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

// An arm with setup owns a render scope, so it stays one compiled fragment.
export function SetupArmChildren(props: { shown: boolean; inspect: Inspect }) @{
	<Inspector inspect={props.inspect}>
		@if (props.shown) {
			const label = 'setup';
			<i>{label}</i>
		}
	</Inspector>
}

// A keyed list whose rows hide behind an @if, as a Select filters its options.
export function KeyedIfRows(props: { ids: string[]; hidden: string; inspect: Inspect }) @{
	<Inspector inspect={props.inspect}>
		@for (const id of props.ids; key id) {
			@if (id !== props.hidden) {
				<Item value={id} />
			}
		}
	</Inspector>
}

// The same rows without the header key.
export function KeylessIfRows(props: { ids: string[]; hidden: string; inspect: Inspect }) @{
	<Inspector inspect={props.inspect}>
		@for (const id of props.ids) {
			@if (id !== props.hidden) {
				<Item value={id} />
			}
		}
	</Inspector>
}

// A keyed list of groups, each row a nested list.
export function KeyedGroupRows(props: {
	groups: { id: string; items: string[] }[];
	inspect: Inspect;
}) @{
	<Inspector inspect={props.inspect}>
		@for (const group of props.groups; key group.id) {
			@for (const id of group.items; key id) {
				<Item value={id} />
			}
		}
	</Inspector>
}

// A keyed list whose row, or one arm of it, renders a fragment.
export function KeyedFragmentRows(props: { ids: string[]; paired: string; inspect: Inspect }) @{
	<Inspector inspect={props.inspect}>
		@for (const id of props.ids; key id) {
			<>
				<Item value={id} />
				<b>{id}</b>
			</>
		}
		@for (const id of props.ids; key id) {
			@if (id === props.paired) {
				<>
					<Item value={id} />
					<b>{id}</b>
				</>
			} @else {
				<Item value={id} />
			}
		}
	</Inspector>
}

// A keyed row whose @if arm has setup keeps the list one compiled fragment.
export function KeyedSetupArmRows(props: { ids: string[]; inspect: Inspect }) @{
	<Inspector inspect={props.inspect}>
		@for (const id of props.ids; key id) {
			@if (id !== 'b') {
				const label = id + '!';
				<Item value={label} />
			}
		}
	</Inspector>
}
