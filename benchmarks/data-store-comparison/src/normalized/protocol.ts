import type { MessagePort } from 'node:worker_threads';
import type { Book, ServerEvent } from '../library.ts';

/** `Omit` applied to each member of a union. */
export type Without<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** UI → worker. */
export type ToWorker =
	| { readonly type: 'start'; readonly persisted: string | undefined; readonly net: MessagePort }
	| { readonly type: 'write'; readonly seq: number; readonly op: Op }
	| { readonly type: 'persist'; readonly seq: number };

export type Op =
	| { readonly kind: 'add'; readonly title: string }
	| { readonly kind: 'update'; readonly id: string; readonly patch: Partial<Book> };

/** Worker → UI. One `views` message carries every view one change moved. */
export type FromWorker =
	| { readonly type: 'views'; readonly views: Record<string, Book[]> }
	| {
			readonly type: 'done';
			readonly seq: number;
			readonly error?: string;
			readonly value?: string;
	  };

/** Worker ↔ network. In a browser this is HTTP and a live feed; here it is a port to the server. */
export type NetRequest =
	| { readonly seq: number; readonly kind: 'all' }
	| { readonly seq: number; readonly kind: 'add'; readonly title: string }
	| {
			readonly seq: number;
			readonly kind: 'update';
			readonly id: string;
			readonly patch: Partial<Book>;
	  };

export type NetMessage =
	| { readonly type: 'reply'; readonly seq: number; readonly ok: boolean; readonly value?: unknown }
	| { readonly type: 'event'; readonly event: ServerEvent };
