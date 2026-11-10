// The playground toolbar's "Octane version" picker: main first, then the
// published releases, filtered as you type. Typing and highlighting only edit
// the draft; choosing an option (click or Enter) calls `onSelect`, and Escape
// or leaving the field restores the active selection's label. The selected
// version's toolchain is loaded by the playground — this control always runs
// on the website's own Octane, whatever version the examples compile against.
//
// It follows the ARIA combobox pattern with a listbox popup: focus stays on
// the input, and `aria-activedescendant` names the highlighted option.
import { useRef, useState } from 'octane';

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
		.popup {
			position: absolute;
			top: calc(100% + 4px);
			left: 0;
			z-index: 50;
			box-sizing: border-box;
			width: max-content;
			min-width: 100%;
			margin: 0;
			list-style: none;
			max-height: 20rem;
			overflow-y: auto;
			padding: 0.25rem;
			border-radius: 8px;
			border: 1px solid var(--border-strong);
			background: var(--panel);
			color: var(--text);
			font-size: 0.85rem;
			box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
		}
		.popup:focus {
			outline: none;
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

const LISTBOX = 'pg-octane-version-list';
const optionId = (index: number) => `pg-octane-version-option-${index}`;

export function PlaygroundVersionCombobox(props: PlaygroundVersionComboboxProps) @{
	const { value, releases, loading, error, disabled, onOpen, onSelect, onRetry } = props;
	// `null` while the field shows the selection rather than typed text.
	const [draft, setDraft] = useState<string | null>(null);
	const [open, setOpen] = useState(false);
	const [highlight, setHighlight] = useState(-1);
	const input = useRef<HTMLInputElement | null>(null);
	const items = [MAIN, ...(releases ?? [])];
	// Keep the active choice in the item model so its label survives an empty
	// or failed release list.
	if (!items.includes(value)) items.push(value);
	const query = draft?.trim().toLowerCase() ?? '';
	const options = query === '' ? items : items.filter((item) => item.toLowerCase().includes(query));
	const latest = releases?.[0];
	const active = open && highlight >= 0 && highlight < options.length ? highlight : -1;

	const show = (index: number) => {
		if (!open) onOpen();
		setOpen(true);
		setHighlight(index);
	};
	const close = () => {
		setOpen(false);
		setDraft(null);
		setHighlight(-1);
	};
	const showAll = () => show(Math.max(items.indexOf(value), 0));
	const choose = (item: string) => {
		close();
		input.current?.focus();
		if (item !== value) onSelect(item);
	};
	const onKeyDown = (event: KeyboardEvent) => {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			const step = event.key === 'ArrowDown' ? 1 : -1;
			const from = active === -1 ? options.indexOf(value) : active;
			show(open ? (from + step + options.length) % options.length : Math.max(from, 0));
		} else if (event.key === 'Enter' && active !== -1) {
			event.preventDefault();
			choose(options[active]);
		} else if (event.key === 'Escape' && (open || draft !== null)) {
			event.preventDefault();
			close();
			// The list may hold focus; hiding it must not drop focus to the page.
			input.current?.focus();
		}
	};

	<div class={theme.version}>
		<label class={theme.label} for="pg-octane-version">
			Octane version
		</label>
		<div
			class={theme.field}
			onKeyDown={onKeyDown}
			// The list can hold focus too (a press on its padding or scrollbar), so
			// the popup closes only once focus leaves the whole field.
			onBlur={(event: FocusEvent) => {
				if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) {
					close();
				}
			}}
		>
			<input
				ref={input}
				id="pg-octane-version"
				class={theme.input}
				role="combobox"
				autocomplete="off"
				spellcheck={false}
				placeholder="main"
				aria-autocomplete="list"
				aria-expanded={open}
				aria-controls={LISTBOX}
				aria-activedescendant={active === -1 ? undefined : optionId(active)}
				aria-describedby="pg-octane-version-status"
				disabled={disabled}
				value={draft ?? value}
				onInput={(event: InputEvent) => {
					setDraft((event.currentTarget as HTMLInputElement).value);
					show(0);
				}}
				onClick={() => {
					if (!open) showAll();
				}}
			/>
			<button
				type="button"
				class={theme.trigger}
				aria-label="Show Octane versions"
				aria-expanded={open}
				aria-controls={LISTBOX}
				tabIndex={-1}
				disabled={disabled}
				// Keep focus in the input, so its blur does not close the popup.
				onMouseDown={(event: MouseEvent) => event.preventDefault()}
				onClick={() => {
					input.current?.focus();
					if (open) close();
					else showAll();
				}}
			>
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
			</button>
			<ul
				id={LISTBOX}
				class={theme.popup}
				role="listbox"
				aria-label="Octane versions"
				hidden={!open}
				tabIndex={-1}
			>
				@for (const item of options; key item) {
					<li
						id={optionId(options.indexOf(item))}
						class={theme.item}
						role="option"
						aria-selected={item === value}
						data-highlighted={options.indexOf(item) === active ? '' : undefined}
						data-selected={item === value ? '' : undefined}
						onMouseMove={() => setHighlight(options.indexOf(item))}
						onClick={() => choose(item)}
					>
						<span>{item as string}</span>
						@if (item === MAIN) {
							<span class={theme.hint}>this site</span>
						} @else if (item === latest) {
							<span class={theme.hint}>latest</span>
						}
					</li>
				} @empty {
					<li class={theme.empty} role="presentation">
						No matching version
					</li>
				}
				@if (releases === null) {
					<li class={theme.empty} role="presentation">
						Loading releases…
					</li>
				}
			</ul>
		</div>
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
