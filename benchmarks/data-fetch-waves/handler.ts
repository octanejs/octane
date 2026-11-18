/**
 * The server's handlers. Every query waits `DB_MS`, a database round trip on
 * the server's own network, far shorter than the browser's. `dashboard` makes
 * the same queries in process: four together, then the owner, which needs the
 * project's `ownerId`.
 */
import { createDataHandler } from 'octane/data/server';
import * as Screen from './screen.data.ts';
import type { Dashboard, Event, Project, Task, User } from './screen.data.ts';

export const DB_MS = 10;
export const MEMBERS = 8;
export const TASKS = 40;
export const EVENTS = 20;

const query = <T>(value: () => T): Promise<T> =>
	new Promise((resolve) => setTimeout(() => resolve(value()), DB_MS));

const userOf = (id: string): User => ({ id, name: `User ${id}` });
const db = {
	project: (id: string) => query<Project>(() => ({ id, name: `Project ${id}`, ownerId: 'u0' })),
	user: (id: string) => query(() => userOf(id)),
	members: (id: string) =>
		query(() => Array.from({ length: MEMBERS }, (_, i) => userOf(`u${i + 1}`))),
	tasks: (id: string) =>
		query<Task[]>(() =>
			Array.from({ length: TASKS }, (_, i) => ({
				id: `${id}-t${i}`,
				title: `Task ${i} of ${id}`,
				done: i % 3 === 0,
			})),
		),
	activity: (id: string) =>
		query<Event[]>(() =>
			Array.from({ length: EVENTS }, (_, i) => ({ id: `${id}-e${i}`, text: `Event ${i}` })),
		),
};

async function dashboardOf(id: string): Promise<Dashboard> {
	const [project, members, tasks, activity] = await Promise.all([
		db.project(id),
		db.members(id),
		db.tasks(id),
		db.activity(id),
	]);
	return { project, owner: await db.user(project.ownerId), members, tasks, activity };
}

export const handler = createDataHandler({}, (_handle, defineHandler) =>
	defineHandler(Screen, {
		project: db.project,
		user: db.user,
		members: db.members,
		tasks: db.tasks,
		activity: db.activity,
		dashboard: dashboardOf,
	}),
);
