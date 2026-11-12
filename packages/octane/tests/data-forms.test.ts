/**
 * Native forms for writes: the server's `forms(request)` runs a form's native
 * POST, and a store's form handle submits the same fields once hydrated.
 */
import { describe, expect, it, vi } from 'vitest';
import {
	createDataStore,
	DataError,
	httpTransport,
	write,
	type StandardSchema,
	type Transport,
} from '../src/data/index.js';
import { createDataHandler } from '../src/data/server.js';

interface Note {
	title: string;
	pinned: boolean;
	priority: number;
	password?: string;
}

/** Each failed rule reports an issue at its field, as Zod and Valibot do. */
const noteSchema: StandardSchema<unknown, Note> = {
	'~standard': {
		version: 1,
		vendor: 'test',
		validate(value: any) {
			const issues = [];
			if (typeof value?.title !== 'string' || value.title.trim() === '') {
				issues.push({ message: 'Enter a title', path: ['title'] });
			}
			if (value?.priority > 5) issues.push({ message: 'At most 5', path: [{ key: 'priority' }] });
			return issues.length > 0 ? { issues } : { value };
		},
	},
};

const addNote = write({
	name: 'notes.add',
	input: noteSchema,
	form: { title: 'text', pinned: 'checkbox', priority: 'number', password: 'secret' },
});
const pinNote = write({
	name: 'notes.pin',
	input: noteSchema,
	form: { title: 'text', pinned: 'boolean', priority: 'number' },
});
/** A write that declares no form fields, so it takes no native POST. */
const clearNotes = write({ name: 'notes.clear', input: noteSchema });

function createServer(contract = addNote, notes: Array<Note & { operationId: string }> = []) {
	const log: string[] = [];
	const add = (input: Note, operationId: string) => {
		if (notes.some((note) => note.operationId === operationId)) return;
		if (notes.some((note) => note.title === input.title)) throw new DataError('duplicate');
		log.push(`add ${input.title}`);
		notes.push({ ...input, operationId });
	};
	const handler = createDataHandler(
		{
			secret: 'test secret',
			context: (request) => ({ account: request.headers.get('x-account') ?? 'ada' }),
			grant: (context) => context.account,
		},
		(handle) => [
			handle(contract, (input, call) => add(input, call.operationId)),
			handle(pinNote, (input, call) => add(input, call.operationId)),
			handle(clearNotes, () => {
				log.push('clear');
			}),
		],
	);
	const transport = httpTransport('https://app.test/data', {
		fetch: (url, init) => handler(new Request(url as string, init)),
	});
	return { notes, log, handler, transport };
}

const page = (headers: Record<string, string> = {}) =>
	new Request('https://app.test/notes?tab=all', { headers });

/** A native POST of `fields` to the page, as a browser sends it. */
function post(fields: Array<[string, string]>, headers: Record<string, string> = {}) {
	return new Request('https://app.test/notes?tab=all', {
		method: 'POST',
		headers: { origin: 'https://app.test', ...headers },
		body: new URLSearchParams(fields),
	});
}

/** The hidden fields a page render gives a form, then the fields the user filled in. */
async function submission(
	server: ReturnType<typeof createServer>,
	fields: Array<[string, string]>,
	options: { write?: typeof addNote; key?: string; account?: string } = {},
) {
	const session = await server.handler.forms(page({ 'x-account': options.account ?? 'ada' }));
	const store = createDataStore({ transport: server.transport, form: session.form });
	const hidden = store.form(options.write ?? addNote, options.key).hidden() as Array<
		[string, string]
	>;
	return [...hidden, ...fields];
}

describe('octane/data forms on the server', () => {
	it('treats an edited restored native form as a new operation', async () => {
		const server = createServer();
		const fields = await submission(server, [
			['title', 'First'],
			['priority', '1'],
			['password', ''],
		]);
		expect((await server.handler.forms(post(fields))).status).toBe(303);
		const edited = fields.map(([name, value]): [string, string] => [
			name,
			name === 'title' ? 'Second' : value,
		]);
		expect((await server.handler.forms(post(edited))).status).toBe(303);
		expect(server.notes.map((note) => note.title)).toEqual(['First', 'Second']);
		expect(server.notes[0]!.operationId).not.toBe(server.notes[1]!.operationId);
	});

	it('replays a native submission after field declarations change order', async () => {
		const first = createServer();
		const fields = await submission(first, [
			['title', 'First'],
			['priority', '1'],
			['password', ''],
		]);
		expect((await first.handler.forms(post(fields))).status).toBe(303);
		const deployed = createServer(
			write({
				name: addNote.name,
				input: noteSchema,
				form: { password: 'secret', priority: 'number', pinned: 'checkbox', title: 'text' },
			}),
			first.notes,
		);
		expect((await deployed.handler.forms(post(fields))).status).toBe(303);
		expect(first.notes).toHaveLength(1);
	});

	it('clears a held form and its subscribers when its owner retires', async () => {
		const server = createServer();
		const store = createDataStore({ transport: server.transport });
		const form = store.form(addNote);
		const data = new FormData();
		data.set('title', 'old draft');
		await expect(form.submit(data)).rejects.toMatchObject({ code: 'invalid' });
		expect(form.getSnapshot().values['title']).toBe('old draft');
		const notify = vi.fn();
		form.subscribe(notify);
		await store.retire();
		expect(notify).toHaveBeenCalled();
		expect(form.getSnapshot()).toMatchObject({
			pending: false,
			values: {},
			issues: {},
			error: null,
		});
		await expect(form.submit(data)).rejects.toMatchObject({ name: 'DataRetiredError' });
		expect(form.getSnapshot().values).toEqual({});
	});

	it('runs an accepted native submission once and answers 303 back to the page', async () => {
		const server = createServer();
		const fields = await submission(server, [
			['title', 'Tides'],
			['pinned', 'on'],
			['priority', '2'],
			['password', ''],
		]);

		const session = await server.handler.forms(post(fields));
		expect(session.status).toBe(303);
		expect(session.response!.status).toBe(303);
		expect(session.response!.headers.get('location')).toBe('/notes?tab=all');
		expect(server.notes).toMatchObject([{ title: 'Tides', pinned: true, priority: 2 }]);

		// Submitting the same rendered page again carries the same operation ID.
		expect((await server.handler.forms(post(fields))).status).toBe(303);
		expect(server.log).toEqual(['add Tides']);
	});

	it('refuses an invalid submission with its fields issues and values, without running it', async () => {
		const server = createServer();
		const session = await server.handler.forms(
			post(
				await submission(server, [
					['title', ' '],
					['priority', '9'],
					['password', 'hunter2'],
				]),
			),
		);

		expect(session.response).toBeNull();
		expect(session.status).toBe(400);
		expect(session.form.outcome).toMatchObject({
			write: 'notes.add',
			error: 'invalid',
			issues: { title: 'Enter a title', priority: 'At most 5' },
			// A secret field is never sent back to the page.
			values: { title: ' ', priority: '9' },
		});
		expect(server.log).toEqual([]);
	});

	it('refuses missing, repeated, unknown and malformed fields', async () => {
		const server = createServer();
		const session = await server.handler.forms(
			post(
				await submission(
					server,
					[
						['title', 'Tides'],
						['title', 'Again'],
						['pinned', 'yes'],
						['color', 'red'],
					],
					{ write: pinNote },
				),
			),
		);

		expect(session.status).toBe(400);
		expect(session.form.outcome!.issues).toEqual({
			title: 'Submitted more than once',
			color: 'Unexpected field',
			pinned: 'Expected true or false',
			priority: 'Required',
		});
		expect(server.log).toEqual([]);
	});

	it('refuses a form signed for another account, or posted from another origin', async () => {
		const server = createServer();
		const fields = await submission(
			server,
			[
				['title', 'Tides'],
				['priority', '1'],
				['password', ''],
			],
			{ account: 'grace' },
		);

		const switched = await server.handler.forms(post(fields, { 'x-account': 'ada' }));
		expect(switched.status).toBe(403);
		expect(switched.form.outcome!.error).toBe('forbidden');

		const forged = fields.map(([name, value]): [string, string] =>
			name === '$token'
				? [name, value.replace(/^./, (c) => (c === 'A' ? 'B' : 'A'))]
				: [name, value],
		);
		expect((await server.handler.forms(post(forged, { 'x-account': 'grace' }))).status).toBe(403);

		const crossSite = await server.handler.forms(
			post(fields, { 'x-account': 'grace', origin: 'https://evil.test' }),
		);
		expect(crossSite.status).toBe(403);
		expect(server.log).toEqual([]);

		expect((await server.handler.forms(post(fields, { 'x-account': 'grace' }))).status).toBe(303);
		expect(server.log).toEqual(['add Tides']);
	});

	it('takes no native POST for a write without form fields', async () => {
		const server = createServer();
		const session = await server.handler.forms(
			post([
				['$write', 'notes.clear'],
				['title', 'Tides'],
			]),
		);
		expect(session.status).toBe(400);
		expect(session.form.outcome!.error).toBe('not_found');
		expect(server.log).toEqual([]);
	});

	it('leaves pages and other posts to the app', async () => {
		const server = createServer();
		const get = await server.handler.forms(page());
		expect(get).toMatchObject({ response: null, status: 200 });
		expect(get.form.token).not.toBe('');

		const other = await server.handler.forms(post([['search', 'tides']]));
		expect(other).toMatchObject({ response: null, status: 200 });
		expect(other.form.outcome).toBeNull();
	});
});

describe('octane/data forms in the store', () => {
	it('carries a refused submission into the page and its hydration, once', async () => {
		const server = createServer();
		const session = await server.handler.forms(
			post(
				await submission(
					server,
					[
						['title', ''],
						['priority', '1'],
						['password', 'hunter2'],
					],
					{ key: 'draft' },
				),
			),
		);
		const rendering = createDataStore({ transport: server.transport, form: session.form });
		const expected = {
			pending: false,
			error: 'invalid',
			issues: { title: 'Enter a title' },
			values: { title: '', priority: '1' },
		};
		expect(rendering.form(addNote, 'draft').getSnapshot()).toEqual(expected);
		// Another instance of the same write has its own state.
		expect(rendering.form(addNote, 'other').getSnapshot().error).toBeNull();

		const browser = createDataStore({ transport: server.transport, seed: rendering.dehydrate() });
		const form = browser.form(addNote, 'draft');
		expect(form.getSnapshot()).toEqual(expected);
		expect(form.hidden()).toEqual(rendering.form(addNote, 'draft').hidden());
		expect(form.hidden().map(([name]) => name)).toEqual(['$write', '$key', '$token', '$operation']);
	});

	it('encodes typed hidden values the way the server decodes them', async () => {
		const server = createServer();
		const store = createDataStore({ transport: server.transport });
		const fields = store.form(pinNote).hidden({ title: 'Tides', pinned: false, priority: 3 });
		expect(fields).toEqual([
			['$write', 'notes.pin'],
			['title', 'Tides'],
			['pinned', 'false'],
			['priority', '3'],
		]);
		expect(store.form(addNote).hidden({ pinned: false })).toEqual([['$write', 'notes.add']]);
		expect(store.form(addNote).hidden({ pinned: true })).toEqual([
			['$write', 'notes.add'],
			['pinned', 'on'],
		]);
	});

	it('submits through the store, shows pending, and keeps only the newest outcome', async () => {
		const server = createServer();
		const held: Array<() => void> = [];
		const transport: Transport = async (request, signal) => {
			await new Promise<void>((resolve) => held.push(resolve));
			return server.transport(request, signal);
		};
		const store = createDataStore({ transport });
		const form = store.form(addNote);
		const data = (title: string) => {
			const fields = new FormData();
			fields.set('title', title);
			fields.set('priority', '1');
			fields.set('password', '');
			return fields;
		};

		const first = form.submit(data('Tides'));
		expect(form.getSnapshot()).toMatchObject({ pending: true, error: null });
		const second = form.submit(data('Tides'));
		await new Promise((resolve) => setTimeout(resolve, 0));
		held[1]!();
		await second;
		expect(form.getSnapshot()).toMatchObject({ pending: false, error: null });
		// The older submission is refused as a duplicate, but a newer one has already shown its outcome.
		held[0]!();
		await expect(first).rejects.toMatchObject({ code: 'duplicate' });
		expect(form.getSnapshot()).toMatchObject({ pending: false, error: null });

		await expect(form.submit(data(''))).rejects.toMatchObject({ code: 'invalid' });
		expect(form.getSnapshot()).toMatchObject({
			error: 'invalid',
			issues: { title: 'Enter a title' },
		});
		// An invalid submission is refused before anything is sent.
		expect(held).toHaveLength(2);
	});

	it('submits a form element, stopping its native POST, and resets it unless edited since', async () => {
		const server = createServer();
		const store = createDataStore({ transport: server.transport });
		const form = store.form(addNote);
		const element = document.createElement('form');
		element.innerHTML =
			'<input name="title"><input name="priority" value="1"><input name="password" type="password"><button>Add</button>';
		document.body.append(element);
		const title = element.elements.namedItem('title') as HTMLInputElement;
		const submitWith = () => {
			const event = new SubmitEvent('submit', { cancelable: true });
			let done!: Promise<unknown>;
			element.addEventListener('submit', (e) => (done = form.submit(e)), { once: true });
			element.dispatchEvent(event);
			expect(event.defaultPrevented).toBe(true);
			return done;
		};

		title.value = 'Tides';
		await submitWith();
		expect(server.log).toEqual(['add Tides']);
		expect(title.value).toBe('');

		title.value = 'Kelp';
		const saving = submitWith();
		title.value = 'Kelp forest';
		await saving;
		expect(server.log).toEqual(['add Tides', 'add Kelp']);
		// The reply must not erase what the user typed after submitting.
		expect(title.value).toBe('Kelp forest');
		element.remove();
	});

	it('lets go of a form that unmounted while its submission was in flight', async () => {
		const server = createServer();
		const store = createDataStore({ transport: server.transport });
		const form = store.form(addNote, 'row');
		const stop = form.subscribe(() => {});
		const fields = new FormData();
		fields.set('title', 'Tides');
		fields.set('priority', '1');
		fields.set('password', '');
		const saving = form.submit(fields);
		// The row unmounts on its optimistic edit, before the reply.
		stop();
		await saving;
		expect(store.form(addNote, 'row')).not.toBe(form);
	});

	it('refuses a form handle for a write without form fields', () => {
		const store = createDataStore({ transport: createServer().transport });
		expect(() => store.form(clearNotes)).toThrow(/declares no form fields/);
	});
});
