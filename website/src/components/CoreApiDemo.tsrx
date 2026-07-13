// Small, real Octane components embedded throughout the Core APIs guide.
// Each demo keeps one concept tangible without depending on a backend.
import { use, useActionState, useEffect, useRef, useState } from 'octane';

const demoStyles = <style>
	.demo {
		margin: 1rem 0 1.75rem;
		border: 1px solid var(--border);
		border-radius: 1rem;
		overflow: hidden;
		background: var(--panel);
	}
	.demo :global(.demo-bar) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.65rem 1rem;
		border-bottom: 1px solid var(--border);
		color: var(--text-secondary);
		font-size: 0.78rem;
		font-weight: 650;
		letter-spacing: 0.02em;
	}
	.demo :global(.demo-bar-leading) {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.demo :global(.demo-dot) {
		display: inline-block;
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 999px;
		background: #63d391;
		box-shadow: 0 0 0 4px rgba(99, 211, 145, 0.12);
	}
	.demo :global(.demo-preview) {
		padding: 1.5rem;
		background:
			radial-gradient(circle at 92% 12%, rgba(255, 65, 90, 0.14), transparent 32%), var(--panel);
	}
	.demo :global(.demo-copy) {
		margin-bottom: 1.25rem;
	}
	.demo :global(.demo-title) {
		margin: 0 0 0.15rem;
		color: var(--text);
		font-size: 1rem;
		font-weight: 750;
	}
	.demo :global(.demo-description) {
		margin: 0;
		color: var(--text-secondary);
		font-size: 0.875rem;
	}
	.demo :global(.demo-actions) {
		display: flex;
		flex-wrap: wrap;
		gap: 0.65rem;
	}
	.button {
		min-height: 2.5rem;
		border: 1px solid transparent;
		border-radius: 999px;
		padding: 0.5rem 1rem;
		font: inherit;
		font-size: 0.875rem;
		font-weight: 700;
		cursor: pointer;
		transition:
			background 0.15s,
			border-color 0.15s;
	}
	.primary {
		background: var(--accent);
		color: white;
	}
	.secondary {
		border-color: var(--border);
		background: rgba(255, 255, 255, 0.04);
		color: var(--text);
	}
	.compact {
		min-height: 2rem;
		padding: 0.3rem 0.75rem;
		font-size: 0.78rem;
	}
	.disabled {
		opacity: 0.42;
		cursor: not-allowed;
	}
	.input {
		width: 100%;
		min-height: 2.75rem;
		border: 1px solid var(--border);
		border-radius: 0.75rem;
		padding: 0.6rem 0.8rem;
		background: rgba(22, 24, 29, 0.78);
		color: var(--text);
		font: inherit;
		font-size: 0.9rem;
	}
	.demo :global(.demo-status) {
		margin: 0;
		color: var(--text-secondary);
		font-size: 0.82rem;
	}
	.demo :global(.counter-layout) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.5rem;
	}
	.demo :global(.demo-count) {
		min-width: 4.5rem;
		color: var(--text);
		font-size: clamp(2.75rem, 8vw, 4.5rem);
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.08em;
		line-height: 1;
		text-align: right;
	}
	.demo :global(.packing-summary) {
		margin: 0 0 0.8rem;
		color: var(--text);
		font-size: 0.875rem;
		font-weight: 700;
	}
	.demo :global(.packing-list) {
		list-style: none;
		margin: 0 0 1rem;
		padding: 0;
		display: grid;
		gap: 0.45rem;
	}
	.demo :global(.packing-item) {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.75rem;
		min-height: 3rem;
		border: 1px solid var(--border);
		border-radius: 0.75rem;
		padding: 0.45rem 0.55rem 0.45rem 0.75rem;
		background: rgba(22, 24, 29, 0.48);
	}
	.demo :global(.packing-check) {
		display: inline-grid;
		place-items: center;
		width: 1.35rem;
		height: 1.35rem;
		border: 1px solid #677083;
		border-radius: 999px;
		color: transparent;
		font-size: 0.75rem;
	}
	.packedCheck {
		border-color: #63d391;
		background: rgba(99, 211, 145, 0.16);
		color: #8ae8ae;
	}
	.packedLabel {
		color: var(--text-secondary);
		text-decoration: line-through;
	}
	.demo :global(.packing-empty) {
		border: 1px dashed var(--border);
		border-radius: 0.75rem;
		padding: 1.2rem;
		color: var(--text-secondary);
		text-align: center;
	}
	.demo :global(.shortcut-controls) {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: end;
		gap: 0.75rem;
	}
	.demo :global(.demo-field) {
		display: grid;
		gap: 0.35rem;
		min-width: 0;
		color: var(--text);
		font-size: 0.8rem;
		font-weight: 700;
	}
	.demo :global(.shortcut-note) {
		margin-top: 0.75rem;
	}
	.shortcutKey {
		display: inline-block;
		min-width: 1.5rem;
		border: 1px solid var(--border);
		border-bottom-color: rgba(255, 255, 255, 0.22);
		border-radius: 0.35rem;
		padding: 0.05rem 0.35rem;
		background: rgba(255, 255, 255, 0.06);
		color: var(--text);
		font-size: 0.75rem;
		text-align: center;
	}
	.demo :global(.data-stage) {
		display: grid;
		place-items: center;
		min-height: 9rem;
		margin-bottom: 1rem;
		border: 1px solid var(--border);
		border-radius: 0.875rem;
		padding: 1rem;
		background: rgba(22, 24, 29, 0.58);
	}
	.demo :global(.data-empty),
	.demo :global(.data-loading),
	.demo :global(.data-error) {
		margin: 0;
		color: var(--text-secondary);
		font-size: 0.875rem;
		text-align: center;
	}
	.demo :global(.data-loading) {
		color: var(--text);
	}
	.demo :global(.data-error) {
		color: #ff8797;
	}
	.demo :global(.profile-card) {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		gap: 0.9rem;
		width: min(100%, 24rem);
	}
	.demo :global(.profile-avatar) {
		display: grid;
		place-items: center;
		width: 3.25rem;
		height: 3.25rem;
		border-radius: 999px;
		background: rgba(255, 65, 90, 0.16);
		color: #ff8797;
		font-size: 1.1rem;
		font-weight: 800;
	}
	.demo :global(.profile-name),
	.demo :global(.profile-role) {
		display: block;
	}
	.demo :global(.profile-role) {
		color: var(--text-secondary);
		font-size: 0.82rem;
	}
	.demo :global(.profile-form) {
		display: grid;
		gap: 0.85rem;
	}
	.demo :global(.form-controls) {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: end;
		gap: 0.75rem;
	}
	.demo :global(.form-result) {
		min-height: 1.35rem;
	}
	.success {
		color: #8ae8ae;
	}
	.error {
		color: #ff8797;
	}
	@media (max-width: 520px) {
		.demo :global(.demo-hint) {
			display: none;
		}
		.demo :global(.demo-preview) {
			padding: 1.25rem;
		}
		.demo :global(.counter-layout) {
			align-items: flex-end;
			flex-direction: column;
		}
		.counterActions,
		.demo :global(.shortcut-controls),
		.demo :global(.form-controls) {
			width: 100%;
			grid-template-columns: 1fr;
		}
		.counterActions {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.demo :global(.packing-item) {
			grid-template-columns: auto minmax(0, 1fr);
		}
		.packingToggle {
			grid-column: 1 / -1;
		}
	}
</style>;

interface DemoFrameProps {
	id: string;
	title: string;
	description: string;
	hint: string;
	children: unknown;
}

function DemoFrame(props: DemoFrameProps) @{
	<section class={demoStyles.demo} data-demo={props.id} aria-labelledby={props.id + '-title'}>
		<div class="demo-bar">
			<div class="demo-bar-leading">
				<span class="demo-dot" aria-hidden="true"></span>
				<span class="demo-kicker">Live example</span>
			</div>
			<span class="demo-hint">
				{props.hint as string}
			</span>
		</div>
		<div class="demo-preview">
			<div class="demo-copy">
				<p id={props.id + '-title'} class="demo-title">
					{props.title as string}
				</p>
				<p class="demo-description">
					{props.description as string}
				</p>
			</div>
			{props.children}
		</div>
	</section>
}

export function CoreApiDemo() @{
	const [count, setCount] = useState(0);

	<DemoFrame
		id="state"
		title="Items packed"
		description="The number is state. Each click updates it and renders again."
		hint="Try the buttons"
	>
		<div class="counter-layout">
			<strong class="demo-count" aria-live="polite">
				{count as string}
			</strong>
			<div class={['demo-actions', demoStyles.counterActions]}>
				<button
					type="button"
					class={[
						'demo-button',
						demoStyles.button,
						demoStyles.secondary,
						count === 0 && demoStyles.disabled,
					]}
					disabled={count === 0}
					onClick={() => setCount((current) => Math.max(0, current - 1))}
				>
					Remove one
				</button>
				<button
					type="button"
					class={['demo-button', demoStyles.button, demoStyles.primary]}
					onClick={() => setCount((current) => current + 1)}
				>
					Add one
				</button>
			</div>
		</div>
	</DemoFrame>
}

interface PackingItem {
	id: number;
	label: string;
	packed: boolean;
}

const INITIAL_PACKING_ITEMS: PackingItem[] = [
	{ id: 1, label: 'Passport', packed: false },
	{ id: 2, label: 'Charger', packed: true },
	{ id: 3, label: 'Notebook', packed: false },
];

export function ListConditionsDemo() @{
	const [items, setItems] = useState<PackingItem[]>(INITIAL_PACKING_ITEMS);
	const packedCount = items.filter((item) => item.packed).length;
	const restoreItems = () => setItems(INITIAL_PACKING_ITEMS.map((item) => ({ ...item })));

	<DemoFrame
		id="lists"
		title="Packing list"
		description="The keyed list preserves each row while conditions update its status."
		hint="Pack or clear items"
	>
		<p class="packing-summary" aria-live="polite">
			@if (items.length === 0) {
				<span>Your list is empty.</span>
			} @else if (packedCount === items.length) {
				<span>Everything is packed.</span>
			} @else {
				<span>
					{packedCount + ' of ' + items.length + ' packed'}
				</span>
			}
		</p>
		<ul class="packing-list">
			@for (const item of items; key item.id) {
				<li class="packing-item">
					<span class={['packing-check', item.packed && demoStyles.packedCheck]} aria-hidden="true">
						✓
					</span>
					<span class={['packing-label', item.packed && demoStyles.packedLabel]}>
						{item.label as string}
					</span>
					<button
						type="button"
						class={[
							'demo-button',
							demoStyles.button,
							demoStyles.compact,
							demoStyles.secondary,
							demoStyles.packingToggle,
						]}
						aria-label={(item.packed ? 'Unpack ' : 'Pack ') + item.label}
						aria-pressed={item.packed}
						onClick={() => setItems(
							(current) => current.map(
								(currentItem) => currentItem.id === item.id
									? { ...currentItem, packed: !currentItem.packed }
									: currentItem,
							),
						)}
					>
						{item.packed ? 'Unpack' : 'Pack'}
					</button>
				</li>
			} @empty {
				<li class="packing-empty">No items yet. Restore the list to keep packing.</li>
			}
		</ul>
		<div class="demo-actions">
			<button
				type="button"
				class={[
					'demo-button',
					demoStyles.button,
					demoStyles.secondary,
					items.length === 0 && demoStyles.disabled,
				]}
				disabled={items.length === 0}
				onClick={() => setItems([])}
			>
				Clear list
			</button>
			<button
				type="button"
				class={['demo-button', demoStyles.button, demoStyles.primary]}
				onClick={restoreItems}
			>
				Restore list
			</button>
		</div>
	</DemoFrame>
}

export function RefEffectDemo() @{
	const inputRef = useRef<HTMLInputElement | null>(null);
	const [shortcutUsed, setShortcutUsed] = useState(false);

	useEffect(() => {
		const focusSearch = (event: KeyboardEvent) => {
			const target = event.target;
			const isEditable =
				target instanceof HTMLElement &&
					(target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

			if (
				event.key !== '/' || event.altKey || event.ctrlKey || event.metaKey || event.isComposing ||
					isEditable
			) {
				return;
			}

			event.preventDefault();
			inputRef.current?.focus();
			setShortcutUsed(true);
		};

		window.addEventListener('keydown', focusSearch);
		return () => window.removeEventListener('keydown', focusSearch);
	});

	<DemoFrame
		id="refs-effects"
		title="Shortcut search"
		description="The ref points to the input; the effect owns a global keyboard subscription."
		hint="Press /"
	>
		<div class="shortcut-controls">
			<label class="demo-field" for="core-api-search">
				Search the guide
				<input
					id="core-api-search"
					ref={inputRef}
					class={['demo-input', demoStyles.input]}
					type="search"
					placeholder="Components, state, effects…"
					aria-keyshortcuts="/"
				/>
			</label>
			<button
				type="button"
				class={['demo-button', demoStyles.button, demoStyles.primary]}
				onClick={() => inputRef.current?.focus()}
			>
				Focus search
			</button>
		</div>
		<p class="demo-status shortcut-note" aria-live="polite">
			@if (shortcutUsed) {
				<span>The shortcut focused the search field.</span>
			} @else {
				<span>
					Press
					<kbd class={demoStyles.shortcutKey}>/</kbd>
					outside a form field, or use the button.
				</span>
			}
		</p>
	</DemoFrame>
}

interface DemoProfile {
	initials: string;
	name: string;
	role: string;
}

const DEMO_PROFILE: DemoProfile = {
	initials: 'AL',
	name: 'Ada Lovelace',
	role: 'Mathematician and programmer',
};

function loadDemoProfile(): Promise<DemoProfile> {
	return new Promise((resolve) => {
		setTimeout(() => {
			resolve(DEMO_PROFILE);
		}, 900);
	});
}

function ProfileResult(props: { request: Promise<DemoProfile> }) @{
	const profile = use(props.request);

	<article class="profile-card">
		<span class="profile-avatar" aria-hidden="true">
			{profile.initials as string}
		</span>
		<div>
			<strong class="profile-name">
				{profile.name as string}
			</strong>
			<span class="profile-role">
				{profile.role as string}
			</span>
		</div>
	</article>
}

function ProfileRequest(props: { request: Promise<DemoProfile> }) @{
	@try {
		<ProfileResult request={props.request} />
	} @pending {
		<p class="data-loading" role="status">Loading profile…</p>
	} @catch (error) {
		<p class="data-error" role="alert">
			{error instanceof Error ? error.message : 'The request failed.'}
		</p>
	}
}

export function DataLoadingDemo() @{
	const [request, setRequest] = useState<Promise<DemoProfile> | null>(null);

	<DemoFrame
		id="data"
		title="Profile loader"
		description="The button creates one stable request; the boundary owns the pending UI."
		hint="Start a request"
	>
		<div class="data-stage" aria-live="polite">
			@if (request) {
				<ProfileRequest request={request} />
			} @else {
				<p class="data-empty">Choose a request to see the boundary change.</p>
			}
		</div>
		<div class="demo-actions">
			<button
				type="button"
				class={['demo-button', demoStyles.button, demoStyles.primary]}
				onClick={() => setRequest(loadDemoProfile())}
			>
				Load profile
			</button>
		</div>
	</DemoFrame>
}

interface SaveNameResult {
	status: 'idle' | 'success' | 'error';
	message: string;
}

const INITIAL_SAVE_RESULT: SaveNameResult = {
	status: 'idle',
	message: 'Nothing saved yet.',
};

async function saveDemoName(
	_previousResult: SaveNameResult,
	formData: FormData,
): Promise<SaveNameResult> {
	const name = String(formData.get('name') ?? '').trim();
	if (!name) return { status: 'error', message: 'Enter a name before saving.' };

	await new Promise((resolve) => setTimeout(resolve, 450));
	return { status: 'success', message: 'Saved ' + name + '.' };
}

export function FormActionDemo() @{
	const [result, submit, isPending] = useActionState(saveDemoName, INITIAL_SAVE_RESULT);

	<DemoFrame
		id="form"
		title="Profile form"
		description="The action validates FormData, reports pending work, and returns the next result."
		hint="Save a name"
	>
		<form class="profile-form" action={submit} aria-busy={isPending}>
			<div class="form-controls">
				<label class="demo-field" for="core-api-profile-name">
					Name
					<input
						id="core-api-profile-name"
						class={['demo-input', demoStyles.input]}
						name="name"
						autocomplete="name"
						placeholder="Ada Lovelace"
					/>
				</label>
				<button
					type="submit"
					class={[
						'demo-button',
						demoStyles.button,
						demoStyles.primary,
						isPending && demoStyles.disabled,
					]}
					disabled={isPending}
				>
					{isPending ? 'Saving…' : 'Save profile'}
				</button>
			</div>
			<p
				class={[
					'demo-status',
					'form-result',
					result.status === 'success' && demoStyles.success,
					result.status === 'error' && demoStyles.error,
				]}
				aria-live="polite"
			>
				{result.message as string}
			</p>
		</form>
	</DemoFrame>
}
