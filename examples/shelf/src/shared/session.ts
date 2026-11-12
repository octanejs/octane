/**
 * One signed-in account: its store, the faults the demo can inject into its
 * transport, and a log of what reached the network. Neither front end owns
 * any of this; each renders it with its own binding.
 */
import {
	DataError,
	DataUncertainError,
	createDataStore,
	indexedDBStorage,
	serverListener,
	serverTransport,
	type DataRequest,
	type DataStore,
	type FormState,
	type Transport,
} from 'octane/data';
import { addBook, receipt, removeBook, setRead } from './contracts.ts';
import { data, events } from './data.tsrx';

export const ACCOUNTS = ['ada', 'grace'] as const;
export type Account = (typeof ACCOUNTS)[number];

/**
 * The signed-in account, which the server authenticates each call by. A real
 * app's session cookie is set by its sign-in, HttpOnly; the demo has no sign-in.
 */
export const ACCOUNT_COOKIE = 'shelf-account';

export interface Faults {
	/** Deliver the next write, then lose its reply. */
	dropNextReply: boolean;
	/** Fail every request before it is sent. */
	offline: boolean;
}

export interface NetworkEntry {
	readonly id: number;
	readonly label: string;
}

export interface Session {
	readonly account: Account;
	readonly store: DataStore;
	readonly faults: Faults;
	readonly network: ExternalValue<readonly NetworkEntry[]>;
	readonly outcome: ExternalValue<Outcome>;
}

export type Outcome =
	| { readonly kind: 'idle' }
	| { readonly kind: 'saved' }
	| { readonly kind: 'refused'; readonly message: string }
	| { readonly kind: 'unknown'; readonly operationId: string }
	| { readonly kind: 'checking' };

/** A value both renderers can observe through `useSyncExternalStore`. */
export interface ExternalValue<T> {
	get(): T;
	set(value: T): void;
	subscribe(notify: () => void): () => void;
}

function externalValue<T>(initial: T): ExternalValue<T> {
	let value = initial;
	const listeners = new Set<() => void>();
	return {
		get: () => value,
		set(next) {
			value = next;
			for (const notify of [...listeners]) notify();
		},
		subscribe(notify) {
			listeners.add(notify);
			return () => listeners.delete(notify);
		},
	};
}

function describe(request: DataRequest): string {
	const count = request.refresh?.length ?? 0;
	const refreshed = count === 0 ? '' : ` + ${count} read${count === 1 ? '' : 's'} back`;
	return `${request.kind} ${request.name}${refreshed}`;
}

/**
 * A browser session. `namespace` keeps parallel browser tests on separate
 * server data; `seed` is the server render's data, so hydration loads nothing.
 */
export function openSession(account: Account, namespace = '', seed?: string | null): Session {
	document.cookie = `${ACCOUNT_COOKIE}=${encodeURIComponent(namespace + account)}; path=/; SameSite=Strict`;
	const call = serverTransport(data);
	const faults: Faults = { dropNextReply: false, offline: false };
	const network = externalValue<readonly NetworkEntry[]>([]);
	let sequence = 0;
	const transport: Transport = async (request, signal) => {
		if (faults.offline) throw new Error('offline');
		network.set([{ id: ++sequence, label: describe(request) }, ...network.get()].slice(0, 6));
		const reply = await call(request, signal);
		if (request.kind === 'write' && faults.dropNextReply) {
			faults.dropNextReply = false;
			throw new Error('connection reset after the server replied');
		}
		return reply;
	};
	const partition = namespace + account;
	const persist = {
		storage: indexedDBStorage({ name: 'shelf' }),
		partition,
		// A real app takes a random per-user secret from its signed-in session; the demo has no sign-in.
		key: `shelf demo key for ${partition}`,
		// A write still unsettled when the page closes is shown again on the next load, then settled by its receipt.
		journal: { writes: [addBook, setRead, removeBook], receipt },
	};
	// Another tab's or device's change arrives as an event, so this page shows it without loading.
	const listen = serverListener(events);
	return sessionFor(
		account,
		createDataStore({ transport, seed, persist, listen }),
		faults,
		network,
	);
}

/** A server render's session, around a store whose `data` calls run in process. */
export function serverSession(account: Account, store: DataStore): Session {
	return sessionFor(account, store, { dropNextReply: false, offline: false }, externalValue([]));
}

function sessionFor(
	account: Account,
	store: DataStore,
	faults: Faults,
	network: ExternalValue<readonly NetworkEntry[]>,
): Session {
	return { account, store, faults, network, outcome: externalValue<Outcome>({ kind: 'idle' }) };
}

const MESSAGES: Record<string, string> = {
	duplicate: 'That book is already on the shelf',
	missing: 'That book is no longer on the shelf',
};

/** What a form shows under its field after a refused submission. */
export function formMessage(form: FormState, field: string): string {
	return form.issues[field] ?? (form.error ? (MESSAGES[form.error] ?? '') : '');
}

/** Run a write and report how it ended. The store already shows and rolls back its edit. */
export async function submit(session: Session, run: (store: DataStore) => Promise<unknown>) {
	try {
		await run(session.store);
		session.outcome.set({ kind: 'saved' });
	} catch (error) {
		if (error instanceof DataUncertainError) {
			session.outcome.set({ kind: 'unknown', operationId: error.operationId });
		} else if (error instanceof DataError) {
			const message = error.issues?.[0]?.message ?? MESSAGES[error.code] ?? error.code;
			session.outcome.set({ kind: 'refused', message });
		} else if (!session.store.retired) {
			throw error;
		}
	}
}

/** Ask the server whether an uncertain write landed, then settle it. Nothing is resent. */
export async function checkSaved(session: Session, operationId: string): Promise<void> {
	session.outcome.set({ kind: 'checking' });
	try {
		const handle = session.store.read(receipt, { operationId });
		await handle.refresh();
		const snapshot = handle.getSnapshot();
		if (snapshot.status !== 'ready') throw snapshot.error;
		session.store.settle(operationId, snapshot.value!.applied);
		session.outcome.set(
			snapshot.value!.applied
				? { kind: 'saved' }
				: { kind: 'refused', message: 'The server never received that change' },
		);
	} catch {
		session.outcome.set({ kind: 'unknown', operationId });
	}
}

export function outcomeText(outcome: Outcome): string {
	switch (outcome.kind) {
		case 'idle':
			return '';
		case 'saved':
			return 'Saved';
		case 'refused':
			return outcome.message;
		case 'unknown':
			return 'The reply was lost. The change may have been saved.';
		case 'checking':
			return 'Checking…';
	}
}

/** A URL's namespace, so browser tests can isolate their server data. */
export function namespaceFrom(search: string): string {
	const value = new URLSearchParams(search).get('ns');
	return value ? `${value}:` : '';
}
