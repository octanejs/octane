import { use, useEffect, useState, type OctaneNode } from 'octane';

export interface AliasRow {
	id: number;
	label: string;
}

export interface AliasSelectionProps {
	items: ArrayLike<AliasRow>;
	selected: number | null;
	onPick: (id: number) => void;
	onRemove: (id: number) => void;
}

export function KeyAliasTable(props: AliasSelectionProps) @{
	const items = props.items;
	const selected = props.selected;
	const onPick = props.onPick;
	const onRemove = props.onRemove;
	<table class="key-alias-table">
		<tbody>
			@for (const row of items; key row.id) {
				const id = row.id;
				<tr class={selected === id ? 'selected' : ''} data-id={id}>
					<td>{id}</td>
					<td>
						<a class="pick" onClick={() => onPick(id)}>{row.label}</a>
					</td>
					<td>
						<button class="remove" onClick={() => onRemove(id)}>Remove</button>
					</td>
				</tr>
			}
		</tbody>
	</table>
}

interface NamedAliasRow {
	uuid: string;
	id: string;
	label: string;
}

interface NamedAliasProps {
	items: NamedAliasRow[];
	selected: string | null;
}

export function ReverseKeyAliasList(props: NamedAliasProps) @{
	const selected = props.selected;
	<ul>
		@for (const row of props.items; key row.uuid) {
			const id = row.uuid;
			<li class={id === selected ? 'selected' : ''}>{row.label as string}</li>
		}
	</ul>
}

export function MismatchedKeyAliasList(props: NamedAliasProps) @{
	const selected = props.selected;
	<ul>
		@for (const row of props.items; key row.uuid) {
			const id = row.id;
			<li class={selected === id ? 'selected' : ''}>{row.label as string}</li>
		}
	</ul>
}

export function OverriddenKeyAliasList(props: NamedAliasProps) @{
	const selected = props.selected;
	<ul>
		@for (const row of props.items; key row.id) {
			const id = row.id;
			<li key={row.uuid} class={selected === id ? 'selected' : ''}>{row.label as string}</li>
		}
	</ul>
}

export function CapturedSelectionAliasList(props: {
	items: AliasRow[];
	selected: number | null;
	onObserve: (id: number, selected: number | null) => void;
}) @{
	const selected = props.selected;
	const onObserve = props.onObserve;
	<ul>
		@for (const row of props.items; key row.id) {
			const id = row.id;
			<li
				class={selected === id ? 'selected' : ''}
				data-id={id}
				onClick={() => onObserve(id, selected)}
			>{row.label as string}</li>
		}
	</ul>
}

export function ShadowedSelectionAliasList(props: {
	items: AliasRow[];
	selected: number | null;
	onObserve: (id: number, eventType: string) => void;
}) @{
	const selected = props.selected;
	const onObserve = props.onObserve;
	<ul>
		@for (const row of props.items; key row.id) {
			const id = row.id;
			<li
				class={selected === id ? 'selected' : ''}
				data-id={id}
				onClick={(selected: MouseEvent) => onObserve(id, selected.type)}
			>{row.label as string}</li>
		}
	</ul>
}

export function ControlledKeyAliasList(props: {
	items: AliasRow[];
	selected: number | null;
}) @{
	const selected = props.selected;
	<ul>
		@for (const row of props.items; key row.id) {
			const id = row.id;
			<li class={selected === id ? 'selected' : ''}>
				<input value={row.label} readOnly={true} />
			</li>
		}
	</ul>
}

export function RenderableKeyAliasList(props: {
	items: Array<{ id: number; content: OctaneNode }>;
	selected: number | null;
}) @{
	const selected = props.selected;
	<ul>
		@for (const row of props.items; key row.id) {
			const id = row.id;
			<li class={selected === id ? 'selected' : ''}>{row.content}</li>
		}
	</ul>
}

export interface ReplayAliasProps {
	items: ArrayLike<AliasRow>;
	selected: number | null;
	before: () => void;
	tail: OctaneNode;
}

export function ReplayKeyAliasList(props: ReplayAliasProps) @{
	const items = props.items;
	const selected = props.selected;
	props.before();
	<section>
		<ul>
			@for (const row of items; key row.id) {
				const id = row.id;
				<li class={selected === id ? 'selected' : ''}>{row.label as string}</li>
			}
		</ul>
		{props.tail}
	</section>
}

type Setter<T> = (next: T | ((previous: T) => T)) => void;

export interface AliasTransitionApi {
	setSelected: Setter<number | null>;
	setResource: Setter<Promise<string>>;
}

function AliasResource(props: { promise: Promise<string> }) @{
	const value = use(props.promise);
	<p class="alias-resource">{value as string}</p>
}

export function SuspenseKeyAliasTable(props: {
	items: AliasRow[];
	initialResource: Promise<string>;
	onMounted: (api: AliasTransitionApi) => void;
}) @{
	const [selected, setSelected] = useState<number | null>(1);
	const [resource, setResource] = useState(props.initialResource);
	useEffect(() => {
		props.onMounted({ setSelected, setResource });
	}, []);
	<section>
		@try {
			<div>
				<table class="key-alias-table">
					<tbody>
						@for (const row of props.items; key row.id) {
							const id = row.id;
							<tr class={selected === id ? 'selected' : ''}>
								<td>{id}</td>
								<td>
									<a class="pick" onClick={() => setSelected(id)}>{row.label}</a>
								</td>
							</tr>
						}
					</tbody>
				</table>
				<AliasResource promise={resource} />
			</div>
		} @pending {
			<p role="status">Loading selection</p>
		}
	</section>
}
