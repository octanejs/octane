import { useState } from 'octane';
import { Command } from '@octanejs/cmdk';

// @octanejs/cmdk — the command menu ported from cmdk@1.1.1.
//
// Type to filter (fuzzy, score-ranked), ArrowUp/ArrowDown or ctrl+n/ctrl+p to
// move, Home/End to jump, Enter to select. The toggles below expose the
// behaviours that differ from upstream, so they can be checked by hand.
export function CommandMenu() @{
	const [picked, setPicked] = useState('(nothing yet)');
	const [showForceMount, setShowForceMount] = useState(false);
	const [loop, setLoop] = useState(false);
	const [dialogOpen, setDialogOpen] = useState(false);

	<div>
		<h2 class="demo-title">{'Command menu (@octanejs/cmdk)'}</h2>
		<p
			class="demo-blurb"
		>{'Fuzzy filtering with score ordering, grouped results, and full keyboard navigation. Selection is driven by the real DOM, not a virtual list.'}</p>

		<div class="row" style="margin-bottom: 12px; flex-wrap: wrap">
			<button class="btn" onClick={() => setShowForceMount(!showForceMount)}>
				{showForceMount ? 'Hide forceMount item' : 'Show forceMount item'}
			</button>
			<button class="btn" onClick={() => setLoop(!loop)}>
				{loop ? 'Looping: on' : 'Looping: off'}
			</button>
			<button class="btn" onClick={() => setDialogOpen(true)}>{'Open as dialog'}</button>
		</div>

		<div class="cmdk-shell">
			<Command label="Command Menu" loop={loop}>
				<Command.Input placeholder="Type to search… (try 'gi', 'set', 'zzz')" />
				<Command.List>
					<Command.Empty>{'No results found.'}</Command.Empty>

					@if (showForceMount) {
						<Command.Item
							forceMount
							onSelect={(v) => setPicked(v)}
						>{'Always visible (forceMount)'}</Command.Item>
					}

					<Command.Group heading="Navigation">
						<Command.Item onSelect={(v) => setPicked(v)}>{'Go to Dashboard'}</Command.Item>
						<Command.Item onSelect={(v) => setPicked(v)}>{'Go to Settings'}</Command.Item>
						<Command.Item onSelect={(v) => setPicked(v)}>{'Go to Profile'}</Command.Item>
					</Command.Group>

					<Command.Separator />

					<Command.Group heading="Actions">
						<Command.Item
							keywords={['new', 'create']}
							onSelect={(v) => setPicked(v)}
						>{'Add a document'}</Command.Item>
						<Command.Item onSelect={(v) => setPicked(v)}>{'Rename workspace'}</Command.Item>
						<Command.Item disabled>{'Delete workspace (disabled)'}</Command.Item>
					</Command.Group>
				</Command.List>
			</Command>
		</div>

		<div class="panel" style="margin-top: 12px">
			<div>
				{'Last selected: '}
				<code class="kbd">{picked}</code>
			</div>
		</div>

		<Command.Dialog
			open={dialogOpen}
			onOpenChange={setDialogOpen}
			label="Command Menu"
			contentClassName="cmdk-dialog-content"
			overlayClassName="cmdk-dialog-overlay"
		>
			<Command.Input placeholder="Search in the dialog…" />
			<Command.List>
				<Command.Empty>{'No results found.'}</Command.Empty>
				<Command.Item
					onSelect={(v) => {
						setPicked(v);
						setDialogOpen(false);
					}}
				>{'Dialog: first action'}</Command.Item>
				<Command.Item
					onSelect={(v) => {
						setPicked(v);
						setDialogOpen(false);
					}}
				>{'Dialog: second action'}</Command.Item>
			</Command.List>
		</Command.Dialog>
	</div>
}
