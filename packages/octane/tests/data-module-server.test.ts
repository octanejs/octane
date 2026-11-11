/**
 * A store served through a `module server` function: in the browser through the
 * compiler's RPC stub, during a server render in process. Both reach the same
 * `createDataHandler` handlers with the server call's request context.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { __serverRpcStream } from 'octane';
import { __serverRpcPreload } from 'octane/internal/server-rpc';
import {
	__registerServerFunction,
	__setServerCallContextSource,
	executeServerFunctionStream,
	type ServerCallContext,
} from 'octane/server';
import {
	createDataStore,
	DataError,
	DataUncertainError,
	entity,
	read,
	serverTransport,
	write,
	type StandardSchema,
} from '../src/data/index.js';
import { createDataHandler } from '../src/data/server.js';
import { compile } from 'octane/compiler';

__serverRpcPreload();

interface Note {
	id: string;
	title: string;
	/** A Date: plain server-call data cannot carry one, so it shows the store's own encoding. */
	at: Date;
}

const accept = <T>(check: (value: any) => boolean): StandardSchema<unknown, T> => ({
	'~standard': {
		version: 1,
		vendor: 'test',
		validate: (value) => (check(value) ? { value: value as T } : { issues: [{ message: 'no' }] }),
	},
});
const isNote = (value: any) => typeof value?.id === 'string' && value.at instanceof Date;
const Note = entity('note', accept<Note>(isNote));
const notes = read({
	name: 'notes',
	output: accept<Note[]>((value) => Array.isArray(value) && value.every(isNote)),
	entities: (list) => Note.from(list),
});
const addNote = write({
	name: 'notes.add',
	input: accept<{ title: string }>((value) => typeof value?.title === 'string'),
	creates: Note,
	draft: (input, id) => ({ id, title: input.title, at: new Date(0) }),
});

const TARGET = { id: 'deadbeef', module: '/src/data.tsrx', export: 'data' };
const AT = new Date('2026-11-11T12:00:00Z');

/** What a `module server` block declares: one handler per viewer's notes, served through `data`. */
function serverBlock() {
	const shelves = new Map<string, Note[]>();
	const handler = createDataHandler(
		{ context: (_request, call) => ({ viewer: String(call?.viewer ?? 'nobody') }) },
		(handle) => [
			handle(notes, (_, { viewer }) => shelves.get(viewer) ?? []),
			handle(addNote, (input, { viewer, operationId }) => {
				if (input.title === 'refused') throw new DataError('refused');
				if (input.title === 'crash') throw new Error('database unavailable');
				const list = shelves.get(viewer) ?? [];
				list.push({ id: operationId, title: input.title, at: AT });
				shelves.set(viewer, list);
			}),
		],
	);
	// As the compiler registers an export whose last parameter is a ServerCallContext.
	const data = __registerServerFunction(
		(request: string, call: ServerCallContext) => handler.serve(request, call),
		1,
		TARGET,
	);
	return { data, shelves };
}

/** The browser's stub for `data`, as the compiler emits it, over an app endpoint for `viewer`. */
function browser(data: Function, viewer: string) {
	const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const request = new Request(new URL(String(input), location.href), init);
		const body = executeServerFunctionStream(data, await request.text(), {
			request,
			signal: request.signal,
			viewer,
		});
		return new Response(body, { headers: { 'Content-Type': 'application/x-octane-rpc+ndjson' } });
	});
	const stub = (request: string, options?: { signal?: AbortSignal }) =>
		__serverRpcStream(TARGET.id, [request], options) as Promise<string>;
	return { fetch, stub };
}

afterEach(() => {
	vi.restoreAllMocks();
	__setServerCallContextSource({ getStore: () => undefined });
});

describe('octane/data over module server', () => {
	it("serves reads and writes through the server call, with the store's encoding and the call's viewer", async () => {
		const { data, shelves } = serverBlock();
		shelves.set('ada', [{ id: 'n1', title: 'Tides', at: AT }]);
		const { fetch, stub } = browser(data, 'ada');
		const store = createDataStore({ transport: serverTransport(stub) });

		const list = store.read(notes, undefined);
		list.subscribe(() => {});
		await vi.waitFor(() => expect(list.getSnapshot().status).toBe('ready'));
		expect(list.getSnapshot().value).toEqual([{ id: 'n1', title: 'Tides', at: AT }]);
		expect(list.getSnapshot().value![0]!.at).toBeInstanceOf(Date);

		await store.write(addNote, { title: 'Kelp' });
		expect(shelves.get('ada')!.map((note) => note.title)).toEqual(['Tides', 'Kelp']);
		// Every request went to the app's server-function endpoint.
		expect(fetch.mock.calls.every(([url]) => String(url).includes(TARGET.id))).toBe(true);

		await expect(store.write(addNote, { title: 'refused' })).rejects.toMatchObject({
			code: 'refused',
		});
	});

	it('leaves a write whose server call failed uncertain', async () => {
		const { data } = serverBlock();
		const { stub } = browser(data, 'ada');
		const store = createDataStore({ transport: serverTransport(stub) });
		await expect(store.write(addNote, { title: 'crash' })).rejects.toBeInstanceOf(
			DataUncertainError,
		);
	});

	it('calls the same function in process during a server render, under the request it renders', async () => {
		const { data, shelves } = serverBlock();
		shelves.set('grace', [{ id: 'n2', title: 'Dune', at: AT }]);
		const fetch = vi.spyOn(globalThis, 'fetch');
		const request = new Request('https://app.test/notes');
		const invoked: string[] = [];
		__setServerCallContextSource({
			getStore: () => ({
				invoke: (target, _options, execute) => {
					invoked.push(target.export);
					return execute({ request, signal: request.signal, viewer: 'grace' });
				},
			}),
		});

		const store = createDataStore({ transport: serverTransport(data) });
		await store.prefetch(notes, undefined);
		expect(store.read(notes, undefined).getSnapshot().value).toEqual([
			{ id: 'n2', title: 'Dune', at: AT },
		]);
		expect(invoked).toEqual(['data']);
		expect(fetch).not.toHaveBeenCalled();
		store.retire();
	});

	it("signs a page's forms for the viewer middleware passes, and refuses them for another", async () => {
		const addTitle = write({
			name: 'notes.title',
			input: accept<{ title: string }>((value) => typeof value?.title === 'string'),
			form: { title: 'text' },
		});
		const added: string[] = [];
		const handler = createDataHandler(
			{
				context: (_request, caller) => ({ viewer: String(caller?.viewer) }),
				secret: 'test secret',
				grant: ({ viewer }) => viewer,
			},
			(handle) => [
				handle(addTitle, (input, { viewer }) => void added.push(`${viewer}:${input.title}`)),
			],
		);
		const page = new Request('https://app.test/notes');
		const store = createDataStore({
			transport: async () => ({ ok: true, value: null }),
			form: (await handler.forms(page, { viewer: 'ada' })).form,
		});
		const fields = [...store.form(addTitle).hidden(), ['title', 'Tides']] as Array<
			[string, string]
		>;
		const post = () =>
			new Request('https://app.test/notes', {
				method: 'POST',
				headers: { origin: 'https://app.test' },
				body: new URLSearchParams(fields),
			});

		expect((await handler.forms(post(), { viewer: 'grace' })).status).toBe(403);
		expect((await handler.forms(post(), { viewer: 'ada' })).status).toBe(303);
		expect(added).toEqual(['ada:Tides']);
	});

	it('compiles a module server block that serves the store, and ships none of it to the browser', () => {
		const source = `
module server {
	import { createDataHandler } from 'octane/data/server';
	import type { ServerCallContext } from 'octane/server';
	import { notes } from './contracts.ts';

	const handler = createDataHandler({}, (handle) => [handle(notes, () => [])]);

	export async function data(request: string, call: ServerCallContext) {
		return handler.serve(request, call);
	}
}

import { createDataStore, serverTransport } from 'octane/data';
import { data } from 'server';

export const store = createDataStore({ transport: serverTransport(data) });
`;
		const client = compile(source, '/src/data.tsrx', { mode: 'client' }).code;
		expect(client).not.toContain('createDataHandler');
		expect(client).toContain('__serverRpcStream');
		const server = compile(source, '/src/data.tsrx', { mode: 'server' }).code;
		expect(server).toContain('createDataHandler');
	});
});
