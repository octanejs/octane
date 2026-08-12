// Differential fixtures: the SAME source runs through @octanejs/cmdk (octane)
// and the published cmdk@1.1.1 (React) — `_setup.ts` rewrites the import for the
// React side. Keep these free of anything non-deterministic.
import { useLayoutEffect, useRef, useState } from 'octane';
import { Command } from '@octanejs/cmdk';

// Flat list: the byte-equal baseline (render, filter, keyboard, empty state).
// Salad leads so a query of "a" ranks Apple above Salad — source order and
// score order disagree, which is what pins the CSS-order ranking divergence.
export function CmdkDiff() @{
	<Command label="Command Menu">
		<Command.Input placeholder="Search…" />
		<Command.List>
			<Command.Empty>No results found.</Command.Empty>
			<Command.Item>Salad</Command.Item>
			<Command.Item>Apple</Command.Item>
			<Command.Item>Banana</Command.Item>
			<Command.Item>Cherry</Command.Item>
		</Command.List>
	</Command>
}

// Grouped list: exercises headings, separators and group visibility. Group
// ORDER is a documented divergence (upstream's group reorder is dead code), so
// the parity suite drives this one through `observe`, not `step`.
export function CmdkDiffGroups() @{
	<Command label="Command Menu">
		<Command.Input placeholder="Search…" />
		<Command.List>
			<Command.Empty>No results found.</Command.Empty>
			<Command.Group heading="Fruits">
				<Command.Item>Apple</Command.Item>
				<Command.Item>Banana</Command.Item>
			</Command.Group>
			<Command.Separator />
			<Command.Group heading="Vegetables">
				<Command.Item>Carrot</Command.Item>
				<Command.Item>Potato</Command.Item>
			</Command.Group>
		</Command.List>
	</Command>
}

// Force-mounted item stays visible through any search; Empty must consult it,
// then return after the force-mounted item is removed.
export function CmdkDiffForceMount() @{
	const [showForced, setShowForced] = useState(true);
	<Command label="Command Menu">
		<button
			type="button"
			id="remove-forced"
			onClick={function onRemove() {
				setShowForced(false);
			}}
		>
			remove
		</button>
		<Command.Input placeholder="Search…" />
		<Command.List>
			<Command.Empty>No results found.</Command.Empty>
			@if (showForced) {
				<Command.Item forceMount>Always Here</Command.Item>
			}
			<Command.Item>Apple</Command.Item>
		</Command.List>
	</Command>
}

// Force-mounted non-match after a real match: pins where unranked items land.
export function CmdkDiffForceMountRank() @{
	<Command label="Command Menu">
		<Command.Input placeholder="Search…" />
		<Command.List>
			<Command.Item>Apple</Command.Item>
			<Command.Item forceMount>Always Here</Command.Item>
			<Command.Item>Apricot</Command.Item>
		</Command.List>
	</Command>
}

// Toggle a force-mounted item that shares a value with a plain replacement on
// one live Command (not across remounts) so registration release is exercised.
export function CmdkDiffForceMountSwap() @{
	const [forced, setForced] = useState(true);
	<Command label="Command Menu">
		<button
			type="button"
			id="swap"
			onClick={function onSwap() {
				setForced(function toggle(previous) {
					return !previous;
				});
			}}
		>
			swap
		</button>
		<Command.List>
			@if (forced) {
				<Command.Item forceMount value="Apple">Apple</Command.Item>
			}
			@if (!forced) {
				<Command.Item value="Apple">Apple</Command.Item>
			}
		</Command.List>
	</Command>
}

// Controlled selection with a throwing onValueChange — pins batcher isolation.
export function CmdkDiffBatcherIsolation(props: {
	value: string;
	onValueChange: (value: string) => void;
}) @{
	<Command label="Command Menu" value={props.value} onValueChange={props.onValueChange}>
		<Command.Input placeholder="Search…" />
		<Command.List>
			<Command.Item>Apple</Command.Item>
			<Command.Item>Banana</Command.Item>
		</Command.List>
	</Command>
}

// Two items sharing a value — pins the development duplicate-value warning.
export function CmdkDiffDuplicateValue() @{
	<Command label="Command Menu">
		<Command.Input placeholder="Search…" />
		<Command.List>
			<Command.Item>Apple</Command.Item>
			<Command.Item>Apple</Command.Item>
		</Command.List>
	</Command>
}

// Selected force-mounted item removed while a sibling remains — pins reselection.
export function CmdkDiffSelectedForceMount() @{
	const [showForced, setShowForced] = useState(true);
	<Command label="Command Menu">
		<button
			type="button"
			id="remove-forced"
			onClick={function onRemove() {
				setShowForced(false);
			}}
		>
			remove
		</button>
		<Command.List>
			@if (showForced) {
				<Command.Item forceMount value="Apple">Apple</Command.Item>
			}
			<Command.Item value="Banana">Banana</Command.Item>
		</Command.List>
	</Command>
}

// Async results without explicit value props — pins unscored arrival inference.
export function CmdkDiffUnscoredArrival() @{
	const [items, setItems] = useState(['Apple']);
	<Command label="Command Menu">
		<button
			type="button"
			id="add-apricot"
			onClick={function onAdd() {
				setItems(['Apple', 'Apricot']);
			}}
		>
			add
		</button>
		<Command.Input placeholder="Search…" />
		<Command.List>
			<Command.Empty>No results found.</Command.Empty>
			@for (const label of items; key label) {
				<Command.Item>{label as string}</Command.Item>
			}
		</Command.List>
	</Command>
}

// Item value changes under an active search — pins aggregate filter refresh.
export function CmdkDiffValueChangeFilter() @{
	const [itemValue, setItemValue] = useState('apple');
	<Command label="Command Menu">
		<button
			type="button"
			id="match-search"
			onClick={function onMatch() {
				setItemValue('zzz');
			}}
		>
			match
		</button>
		<Command.Input placeholder="Search…" />
		<Command.List>
			<Command.Empty>No results found.</Command.Empty>
			<Command.Group heading="Fruits">
				<Command.Item value={itemValue}>Fruit</Command.Item>
			</Command.Group>
		</Command.List>
	</Command>
}

// asChild merges into the child on React; Octane always keeps its host element.
export function CmdkDiffAsChild() @{
	<Command label="Command Menu">
		<Command.List>
			<Command.Item {...{ asChild: true } as object}>
				<a href="#apple">Apple</a>
			</Command.Item>
		</Command.List>
	</Command>
}

// defaultOpen is forwarded on Octane Dialog; upstream only wires open/onOpenChange.
// Portal into this host so each runtime's dialog stays under its data-rt container
// instead of both landing on document.body.
export function CmdkDiffDialogDefaultOpen() @{
	const hostRef = useRef<HTMLElement | null>(null);
	const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
	useLayoutEffect(function bindPortalHost() {
		setPortalHost(hostRef.current);
	}, []);
	<div ref={hostRef} data-cmdk-dialog-host="">
		@if (portalHost) {
			<Command.Dialog defaultOpen container={portalHost} label="Command Menu">
				<Command.Input placeholder="Search…" />
				<Command.List>
					<Command.Item>Apple</Command.Item>
				</Command.List>
			</Command.Dialog>
		}
	</div>
}
