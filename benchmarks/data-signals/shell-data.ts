/**
 * The `shell` scenario's data: what an application shell reads near the top of
 * its tree. One viewer, the viewer's settings, an unread-notification count and
 * the conversation list, each one octane/data read, seeded so nothing loads
 * during a timed step. The open thread's messages are props, not data.
 */
import * as devalue from 'devalue';
import {
	createDataStore,
	read,
	type Read,
	type ReadHandle,
	type StandardSchema,
} from 'octane/data';

export interface Viewer {
	readonly name: string;
}
export interface Settings {
	readonly compact: boolean;
}
export interface Notifications {
	readonly unread: number;
}
export interface Conversation {
	readonly id: string;
	readonly title: string;
}
export interface Message {
	readonly id: string;
	readonly text: string;
}

export const CONVERSATIONS = 200;
export const MESSAGES = 100;
/** The conversation a rename changes. */
export const RENAMED = 17;

const any = <T>(): StandardSchema<unknown, T> => ({
	'~standard': { version: 1, vendor: 'bench', validate: (value) => ({ value: value as T }) },
});
// Kept for the session, so unmounting starts no retention timer in any lane.
const kept = { fresh: Infinity, keep: Infinity } as const;
export const viewer = read({ name: 'viewer', output: any<Viewer>(), ...kept });
export const settings = read({ name: 'settings', output: any<Settings>(), ...kept });
export const notifications = read({ name: 'notifications', output: any<Notifications>(), ...kept });
export const conversations = read({
	name: 'conversations',
	output: any<Conversation[]>(),
	...kept,
});

export const messages: readonly Message[] = Array.from({ length: MESSAGES }, (_, index) => ({
	id: `m${index}`,
	text: `message ${index}`,
}));

export interface ShellValues {
	viewer: Viewer;
	settings: Settings;
	notifications: Notifications;
	conversations: Conversation[];
}

export function shellValues(): ShellValues {
	return {
		viewer: { name: 'Ada' },
		settings: { compact: false },
		notifications: { unread: 0 },
		conversations: Array.from({ length: CONVERSATIONS }, (_, index) => ({
			id: `c${index}`,
			title: `conversation ${index}`,
		})),
	};
}

/** A store holding the four reads, already adopted, and their handles. */
export function shellStore(values: ShellValues) {
	const reads = [viewer, settings, notifications, conversations] as const;
	const seed = devalue.stringify({
		reads: reads.map((definition) => ({
			name: definition.name,
			input: undefined,
			age: 0,
			value: values[definition.name as keyof ShellValues],
		})),
		cursors: [],
	});
	const store = createDataStore({
		seed,
		transport: async () => {
			throw new Error('the benchmark never loads');
		},
	});
	const handles: Array<[string, ReadHandle<any>]> = reads.map((definition) => [
		definition.name,
		store.read(definition as Read<void, unknown>),
	]);
	return { store, handles };
}
