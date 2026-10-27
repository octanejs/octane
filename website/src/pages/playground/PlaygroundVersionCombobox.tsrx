// The playground toolbar's "Octane version" picker: main first, then the
// published releases, filtered as you type. Typing and highlighting only edit
// the draft; choosing an option (click or Enter) calls `onSelect`, and Escape
// restores the active selection's label. The selected version's toolchain is
// loaded by the playground — this control always runs on the website's own
// Octane, whatever version the examples compile against.
import { Combobox } from '@octanejs/base-ui/combobox';

const MAIN = 'main';

const theme = (
	<style>
		.version {
			display: inline-flex;
			align-items: center;
			gap: 0.4rem;
			font-size: 0.85rem;
		}
		.label {
			color: var(--text-secondary);
			font-weight: 500;
			white-space: nowrap;
		}
		.field {
			position: relative;
			display: inline-flex;
			align-items: center;
		}
		.input {
			font: inherit;
			font-weight: 500;
			color: var(--text);
			width: 7.5rem;
			padding: 0.35rem 2rem 0.35rem 0.65rem;
			border-radius: 8px;
			border: 1px solid var(--border);
			background: var(--surface-subtle);
		}
		.input:focus-visible {
			outline: 2px solid var(--accent, #ff5d72);
			outline-offset: 1px;
		}
		.input:disabled {
			opacity: 0.5;
		}
		.trigger {
			position: absolute;
			right: 0.2rem;
			display: grid;
			place-items: center;
			width: 1.6rem;
			height: 1.6rem;
			padding: 0;
			border: 0;
			border-radius: 6px;
			background: transparent;
			color: var(--text-secondary);
			cursor: pointer;
		}
		.trigger:focus-visible {
			outline: 2px solid var(--accent, #ff5d72);
		}
		.positioner {
			z-index: 50;
		}
		.popup {
			box-sizing: border-box;
			min-width: var(--anchor-width);
			max-height: min(20rem, var(--available-height));
			overflow-y: auto;
			padding: 0.25rem;
			border-radius: 8px;
			border: 1px solid var(--border-strong);
			background: var(--panel);
			color: var(--text);
			font-size: 0.85rem;
			box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
		}
		.item {
			display: flex;
			justify-content: space-between;
			gap: 1rem;
			padding: 0.3rem 0.6rem;
			border-radius: 6px;
			cursor: pointer;
			font-variant-numeric: tabular-nums;
		}
		.item[data-highlighted] {
			background: var(--surface);
		}
		.item[data-selected] {
			font-weight: 600;
		}
		.hint {
			color: var(--text-secondary);
			font-weight: 400;
		}
		.empty {
			padding: 0.4rem 0.6rem;
			color: var(--text-secondary);
		}
		.empty:empty {
			display: none;
		}
		.status {
			color: var(--text-secondary);
			white-space: nowrap;
		}
		.error {
			color: var(--callout-important);
			max-width: 28rem;
		}
		.retry {
			font: inherit;
			padding: 0.15rem 0.55rem;
			border-radius: 9999px;
			border: 1px solid var(--border);
			background: var(--surface-subtle);
			color: var(--text);
			cursor: pointer;
		}
		@media (max-width: 980px) {
			.label {
				position: absolute;
				width: 1px;
				height: 1px;
				overflow: hidden;
				clip: rect(0 0 0 0);
			}
			.input {
				width: 5.5rem;
			}
		}
	</style>
);

export interface PlaygroundVersionComboboxProps {
	/** The version the playground is running (`main` or an exact release). */
	value: string;
	/** Published releases, newest first; `null` while the list is loading. */
	releases: string[] | null;
	/** The version whose toolchain is loading, if any. */
	loading: string | null;
	/** A loading or validation error to show beside the control. */
	error: string;
	disabled?: boolean;
	/** The popup opened; the playground fetches the release list on first open. */
	onOpen: () => void;
	onSelect: (version: string) => void;
	onRetry: () => void;
}

export function PlaygroundVersionCombobox(props: PlaygroundVersionComboboxProps) @{
	const { value, releases, loading, error, disabled, onOpen, onSelect, onRetry } = props;
	const items = [MAIN, ...(releases ?? [])];
	// Keep the active choice in the item model so its label survives an empty
	// or failed release list.
	if (!items.includes(value)) items.push(value);
	const latest = releases?.[0];

	<div class={theme.version}>
		<Combobox.Root
			items={items}
			value={value}
			onValueChange={(next: string | null) => {
				if (next && next !== value) onSelect(next);
			}}
			onOpenChange={(open: boolean) => {
				if (open) onOpen();
			}}
			disabled={disabled}
		>
			<label class={theme.label} for="pg-octane-version">
				Octane version
			</label>
			<div class={theme.field}>
				<Combobox.Input
					id="pg-octane-version"
					class={theme.input}
					placeholder="main"
					aria-describedby="pg-octane-version-status"
				/>
				<Combobox.Trigger class={theme.trigger} aria-label="Show Octane versions">
					<svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
						<path
							d="M1 1l4 4 4-4"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</Combobox.Trigger>
			</div>
			<Combobox.Portal>
				<Combobox.Positioner class={theme.positioner} sideOffset={4} align="start">
					<Combobox.Popup class={theme.popup}>
						<Combobox.Empty class={theme.empty}>No matching version</Combobox.Empty>
						<Combobox.List>
							{(item: string) => (
								<Combobox.Item key={item} value={item} class={theme.item}>
									<span>{item as string}</span>
									{item === MAIN ? (
										<span class={theme.hint}>this site</span>
									) : item === latest ? (
										<span class={theme.hint}>latest</span>
									) : null}
								</Combobox.Item>
							)}
						</Combobox.List>
						@if (releases === null) {
							<div class={theme.empty}>Loading releases…</div>
						}
					</Combobox.Popup>
				</Combobox.Positioner>
			</Combobox.Portal>
		</Combobox.Root>
		<span id="pg-octane-version-status" role="status" aria-live="polite">
			@if (loading) {
				<span class={theme.status}>{'Loading ' + loading + '…'}</span>
			}
		</span>
		@if (error) {
			<>
				<span class={theme.error} role="alert">
					{error as string}
				</span>
				<button type="button" class={theme.retry} onClick={onRetry}>
					Retry
				</button>
			</>
		}
	</div>
}
