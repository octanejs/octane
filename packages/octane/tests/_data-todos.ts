/** A todo feature's contracts and an in-memory server for them, shared by the data suites. */
import {
	DataError,
	entity,
	httpTransport,
	read,
	write,
	type StandardSchema,
} from '../src/data/index.js';
import { createDataHandler } from '../src/data/server.js';

export interface TodoItem {
	id: string;
	title: string;
	done: boolean;
}

/** A hand-written Standard Schema validator, so the tests need no validator library. */
function schema<T>(check: (value: any) => boolean): StandardSchema<unknown, T> {
	return {
		'~standard': {
			version: 1,
			vendor: 'test',
			validate: (value) =>
				check(value) ? { value: value as T } : { issues: [{ message: 'does not match' }] },
		},
	};
}

const isTodo = (value: any) =>
	typeof value?.id === 'string' && typeof value.title === 'string' && value.title.length > 0;
const Todo = entity('todo', schema<TodoItem>(isTodo));

export const todos = read({
	name: 'todos.list',
	output: schema<TodoItem[]>((value) => Array.isArray(value) && value.every(isTodo)),
	entities: (list) => Todo.from(list),
});
export const firstTodo = read({
	name: 'todos.first',
	output: schema<{ todo: TodoItem }>((value) => isTodo(value?.todo)),
	entities: (page) => Todo.from(page.todo),
});
export const addTodo = write({
	name: 'todos.add',
	input: schema<{ title: string }>(
		(value) => typeof value?.title === 'string' && value.title !== '',
	),
	creates: Todo,
	draft: (input, id) => ({ id, title: input.title, done: false }),
});
export const setDone = write({
	name: 'todos.setDone',
	input: schema<{ id: string; done: boolean }>((value) => typeof value?.done === 'boolean'),
	patches: Todo,
});
export const removeTodo = write({
	name: 'todos.remove',
	input: schema<{ id: string }>((value) => typeof value?.id === 'string'),
	removes: Todo,
});

/** A server with one account's todos, and a log of every request that reached a handler. */
export function createServer() {
	const rows: TodoItem[] = [{ id: 'a', title: 'Tides', done: false }];
	const log: string[] = [];
	const handler = createDataHandler({}, (handle) => [
		handle(todos, () => {
			log.push('list');
			return rows.map((row) => ({ ...row }));
		}),
		handle(firstTodo, () => {
			log.push('first');
			return { todo: { ...rows[0] } };
		}),
		handle(addTodo, (input, call) => {
			log.push(`add ${input.title}`);
			rows.push({ id: call.operationId, title: input.title, done: false });
		}),
		handle(setDone, (input) => {
			log.push(`setDone ${input.done}`);
			const row = rows.find((item) => item.id === input.id);
			if (!row) throw new DataError('missing');
			row.done = input.done;
		}),
		handle(removeTodo, (input) => {
			log.push('remove');
			rows.splice(
				rows.findIndex((item) => item.id === input.id),
				1,
			);
		}),
	]);
	const transport = httpTransport('https://app.test/data', {
		fetch: (url, init) => handler(new Request(url as string, init)),
	});
	return { rows, log, handler, transport };
}
