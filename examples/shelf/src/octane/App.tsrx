import { useState, useSyncExternalStore } from 'octane';
import type { OctaneNode } from 'octane';
import { DataProvider, useFeed, useForm, useRead } from 'octane/data/octane';
import type { Book } from '../shared/contracts.ts';
import {
	addBook,
	books,
	finished,
	removeBook,
	setRead,
	shelfChanges,
	stats,
} from '../shared/contracts.ts';
import {
	ACCOUNTS,
	checkSaved,
	formMessage,
	namespaceFrom,
	openSession,
	outcomeText,
	submit,
	type ExternalValue,
	type Session,
} from '../shared/session.ts';

const LIVE = { connecting: 'Connecting…', live: 'Live', offline: 'Reconnecting…' };

function useExternal<T>(value: ExternalValue<T>): T {
	return useSyncExternalStore(value.subscribe, value.get, value.get);
}

/** Listens to the shelf's changes, so another tab's edit shows here at once. */
function Live() @{
	const feed = useFeed(shelfChanges);
	<p class="live" data-feed={feed.status}>
		{LIVE[feed.status]}
	</p>
}

/** Suspends, so a server render waits for the counts and the page arrives with them. */
function Stats() @{
	const counts = useRead(stats);
	<p class="stats" aria-live="polite">{`${counts.total} books · ${counts.read} read`}</p>
}

function BookList(props: { session: Session }) @{
	const list = useRead(books);
	const session = props.session;
	@if (list.length === 0) {
		<p class="empty">The shelf is empty.</p>
	} @else {
		<ul class="books" aria-label="Books">
			@for (const book of list; key book.id) {
				<li>
					<label>
						<input
							type="checkbox"
							checked={book.read}
							onChange={() =>
								submit(session, (store) => store.write(setRead, { id: book.id, read: !book.read }))
							}
						/>
						<span>{book.title as string}</span>
					</label>
					<RemoveForm session={session} book={book} />
				</li>
			}
		</ul>
	}
}

/** Marking a book read moves it here before the server replies. */
function FinishedList() @{
	const list = useRead(finished);
	<section class="finished" aria-label="Finished">
		<h2>Finished</h2>
		@if (list.length === 0) {
			<p class="empty">Nothing finished yet.</p>
		} @else {
			<ol>
				@for (const book of list; key book.id) {
					<li>{book.title as string}</li>
				}
			</ol>
		}
	</section>
}

/** A native form per row: removing works before hydration and without JavaScript. */
function RemoveForm(props: { session: Session; book: Book }) @{
	const remove = useForm(removeBook, props.book.id);
	<form
		{...remove.attrs}
		onSubmit={(event: SubmitEvent) => submit(props.session, () => remove.submit(event))}
	>
		{remove.hidden({ id: props.book.id })}
		<button aria-label={`Remove ${props.book.title}`}>Remove</button>
	</form>
}

/**
 * Posts natively until hydrated, then through the store. A refused submission
 * keeps what was typed and shows why, after either path.
 */
function AddForm(props: { session: Session }) @{
	const add = useForm(addBook);
	const message = formMessage(add, 'title');
	<form
		class="add"
		{...add.attrs}
		onSubmit={(event: SubmitEvent) => submit(props.session, () => add.submit(event))}
	>
		{add.hidden()}
		<input
			name="title"
			aria-label="Book title"
			aria-invalid={message ? 'true' : undefined}
			placeholder="Add a book"
			defaultValue={add.values.title ?? ''}
		/>
		<button type="submit">Add</button>
		@if (message) {
			<p class="field-error">{message as string}</p>
		}
	</form>
}

function Outcome(props: { session: Session }) @{
	const outcome = useExternal(props.session.outcome);
	<p class="outcome" role="status">
		{outcomeText(outcome) as string}
		@if (outcome.kind === 'unknown') {
			<button type="button" onClick={() => checkSaved(props.session, outcome.operationId)}>
				Check saved result
			</button>
		}
	</p>
}

function Faults(props: { session: Session }) @{
	const faults = props.session.faults;
	<fieldset class="faults">
		<legend>Network faults</legend>
		<label>
			<input
				type="checkbox"
				defaultChecked={faults.dropNextReply}
				onChange={(event: Event) => {
					faults.dropNextReply = (event.currentTarget as HTMLInputElement).checked;
				}}
			/>
			Lose the next reply
		</label>
		<label>
			<input
				type="checkbox"
				defaultChecked={faults.offline}
				onChange={(event: Event) => {
					faults.offline = (event.currentTarget as HTMLInputElement).checked;
				}}
			/>
			Offline
		</label>
	</fieldset>
}

function Network(props: { session: Session }) @{
	const entries = useExternal(props.session.network);
	<section class="network" aria-label="Network">
		<h2>Network</h2>
		<ol>
			@for (const entry of entries; key entry.id) {
				<li>{entry.label as string}</li>
			}
		</ol>
	</section>
}

/** One account's shelf. A new account gets a new store, so nothing carries over. */
export function ShelfBody(props: { session: Session; children?: OctaneNode }) @{
	const session = props.session;
	<DataProvider store={session.store}>
		<Live />
		@try {
			<Stats />
		} @pending {
			<p class="stats">Counting…</p>
		}
		<AddForm session={session} />
		<Outcome session={session} />
		@try {
			<BookList session={session} />
		} @pending {
			<p class="loading">Loading the shelf…</p>
		} @catch (error) {
			<p class="error" role="alert">
				{`Could not load the shelf: ${(error as Error).message}` as string}
			</p>
		}
		@try {
			<FinishedList />
		} @pending {
			<p class="loading">Loading finished books…</p>
		}
		<div class="tools">
			<Faults session={session} />
			<Network session={session} />
		</div>
		{props.children}
	</DataProvider>
}

export function App(props: {
	title: string;
	/** The first account's session; a server render passes one around its own store. */
	session: Session;
	Island?: (props: { session: Session }) => OctaneNode;
}) @{
	const Island = props.Island;
	const [session, setSession] = useState(props.session);
	<main class="shelf">
		<header>
			<h1>{props.title as string}</h1>
			<nav aria-label="Account">
				@for (const account of ACCOUNTS; key account) {
					<button
						type="button"
						aria-pressed={session.account === account}
						onClick={() => {
							if (session.account === account) return;
							// The old account's store is retired: its values clear and late replies are ignored.
							setSession(openSession(account, namespaceFrom(location.search)));
							session.store.retire();
						}}
					>
						{account as string}
					</button>
				}
			</nav>
		</header>
		<ShelfBody key={session.account} session={session}>
			@if (Island) {
				<Island session={session} />
			}
		</ShelfBody>
	</main>
}
