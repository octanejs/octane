// Differential fixtures: the SAME source runs through @octanejs/cmdk (octane)
// and the published cmdk@1.1.1 (React) — `_setup.ts` rewrites the import for the
// React side. Keep these free of anything non-deterministic.
import { Command } from '@octanejs/cmdk';

// Flat list: the byte-equal baseline (render, filter, keyboard, empty state).
export function CmdkDiff() @{
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
