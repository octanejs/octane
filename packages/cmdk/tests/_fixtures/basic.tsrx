// A minimal command menu exercising the Phase 1 surface: Command + Input +
// List + Item + Empty, with the value inferred from each item's textContent.
import { Command } from '@octanejs/cmdk';

export function BasicMenu() @{
	<Command label="Command Menu">
		<Command.Input placeholder="Search…" />
		<Command.List>
			<Command.Empty>No results found.</Command.Empty>
			<Command.Item>Apple</Command.Item>
			<Command.Item>Banana</Command.Item>
			<Command.Item>Cherry</Command.Item>
		</Command.List>
	</Command>
}

// Source order (Salad, Apple) differs from the score order for "a" (Apple ranks
// higher — word-start match), so it exercises DOM reordering.
export function ReorderMenu() @{
	<Command label="Command Menu">
		<Command.Input placeholder="Search…" />
		<Command.List>
			<Command.Item>Salad</Command.Item>
			<Command.Item>Apple</Command.Item>
		</Command.List>
	</Command>
}

export function MenuWithSelect(props: { onSelect: (value: string) => void }) @{
	<Command label="Command Menu">
		<Command.Input placeholder="Search…" />
		<Command.List>
			<Command.Item onSelect={props.onSelect}>Apple</Command.Item>
			<Command.Item onSelect={props.onSelect}>Banana</Command.Item>
			<Command.Item onSelect={props.onSelect}>Cherry</Command.Item>
		</Command.List>
	</Command>
}

export function GroupedMenu() @{
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

// Source order (Beta, Alpha) differs from the score order for "a": Apple is a
// word-start match (high) while Zebra matches late (low), so the Alpha group
// outranks Beta and should sort above it.
export function ScoredGroupsMenu() @{
	<Command label="Command Menu">
		<Command.Input placeholder="Search…" />
		<Command.List>
			<Command.Group heading="Beta">
				<Command.Item>Zebra</Command.Item>
			</Command.Group>
			<Command.Group heading="Alpha">
				<Command.Item>Apple</Command.Item>
			</Command.Group>
		</Command.List>
	</Command>
}

export function LoadingMenu() @{
	<Command label="Command Menu">
		<Command.List>
			<Command.Loading progress={42}>Loading things…</Command.Loading>
		</Command.List>
	</Command>
}

export function LoopMenu() @{
	<Command label="Command Menu" loop>
		<Command.Input placeholder="Search…" />
		<Command.List>
			<Command.Item>Apple</Command.Item>
			<Command.Item>Banana</Command.Item>
			<Command.Item>Cherry</Command.Item>
		</Command.List>
	</Command>
}

export function ControlledMenu(props: { value: string }) @{
	<Command label="Command Menu" value={props.value}>
		<Command.Input placeholder="Search…" />
		<Command.List>
			<Command.Item>Apple</Command.Item>
			<Command.Item>Banana</Command.Item>
			<Command.Item>Cherry</Command.Item>
		</Command.List>
	</Command>
}

// Controlled selection, so setState('value') routes through onValueChange —
// the path where a throwing user callback used to vanish inside the scheduler.
export function ControlledCallbackMenu(props: {
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

// An item whose `value` changes after mount. Re-registering a value while a
// search is active re-scores that item, so the aggregate filter state (the
// match count and the matching groups) has to be refreshed with it — otherwise
// Empty and a matching item can render at the same time.
export function DynamicValueMenu(props: { itemValue: string }) @{
	<Command label="Command Menu">
		<Command.Input placeholder="Search…" />
		<Command.List>
			<Command.Empty>No results found.</Command.Empty>
			<Command.Group heading="Fruits">
				<Command.Item value={props.itemValue}>Fruit</Command.Item>
			</Command.Group>
		</Command.List>
	</Command>
}

// Grouped results whose score order differs from source order, so `sort()`
// physically relocates item nodes. Searching, narrowing to nothing, and then
// clearing takes those relocated nodes through unmount and remount — the path
// where moving a node out of the markers octane fences it with corrupts the
// runtime's bookkeeping.
export function ReorderedGroupsMenu() @{
	<Command label="Command Menu">
		<Command.Input placeholder="Search…" />
		<Command.List>
			<Command.Empty>No results found.</Command.Empty>
			<Command.Group heading="Navigation">
				<Command.Item>Go to Dashboard</Command.Item>
				<Command.Item>Go to Settings</Command.Item>
			</Command.Group>
			<Command.Group heading="Actions">
				<Command.Item>Add a document</Command.Item>
				<Command.Item>Rename workspace</Command.Item>
			</Command.Group>
		</Command.List>
	</Command>
}

// A force-mounted item stays rendered through any search. It is exempt from
// filtering, so it never reaches `filtered.count` — Empty still has to see it.
export function ForceMountMenu() @{
	<Command label="Command Menu">
		<Command.Input placeholder="Search…" />
		<Command.List>
			<Command.Empty>No results found.</Command.Empty>
			<Command.Item forceMount>Always Here</Command.Item>
			<Command.Item>Apple</Command.Item>
		</Command.List>
	</Command>
}

// Two items sharing a value. Selection is value-keyed, so both report
// aria-selected while only the first responds to Enter — an authoring error the
// port reports in development.
export function DuplicateValueMenu() @{
	<Command label="Command Menu">
		<Command.Input placeholder="Search…" />
		<Command.List>
			<Command.Item>Apple</Command.Item>
			<Command.Item>Apple</Command.Item>
		</Command.List>
	</Command>
}

export function KeywordsMenu() @{
	<Command label="Command Menu">
		<Command.Input placeholder="Search…" />
		<Command.List>
			<Command.Empty>No results found.</Command.Empty>
			<Command.Item keywords={['zebra']}>Apple</Command.Item>
			<Command.Item>Banana</Command.Item>
		</Command.List>
	</Command>
}

export function NoFilterMenu() @{
	<Command label="Command Menu" shouldFilter={false}>
		<Command.Input placeholder="Search…" />
		<Command.List>
			<Command.Empty>No results found.</Command.Empty>
			<Command.Item>Apple</Command.Item>
		</Command.List>
	</Command>
}

export function DefaultValueMenu() @{
	<Command label="Command Menu" defaultValue="Banana">
		<Command.Input placeholder="Search…" />
		<Command.List>
			<Command.Item>Apple</Command.Item>
			<Command.Item>Banana</Command.Item>
		</Command.List>
	</Command>
}

export function DisabledItemMenu() @{
	<Command label="Command Menu">
		<Command.Input placeholder="Search…" />
		<Command.List>
			<Command.Item disabled>Apple</Command.Item>
			<Command.Item>Banana</Command.Item>
		</Command.List>
	</Command>
}

export function DialogMenu(props: { open: boolean }) @{
	<Command.Dialog open={props.open} label="Command Menu">
		<Command.Input placeholder="Search…" />
		<Command.List>
			<Command.Item>Apple</Command.Item>
			<Command.Item>Banana</Command.Item>
		</Command.List>
	</Command.Dialog>
}
