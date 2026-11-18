/**
 * The screen's contracts. Four reads are independent once the project ID is
 * known; `user` depends on the project's `ownerId`. `dashboard` is the coarse
 * server-owned read: one request answering all five, its records selected so
 * they are shared with the fine-grained reads' copies.
 */
import { entity, read, type StandardSchema } from 'octane/data';

export interface Project {
	readonly id: string;
	readonly name: string;
	readonly ownerId: string;
}
export interface User {
	readonly id: string;
	readonly name: string;
}
export interface Task {
	readonly id: string;
	readonly title: string;
	readonly done: boolean;
}
export interface Event {
	readonly id: string;
	readonly text: string;
}
export interface Dashboard {
	readonly project: Project;
	readonly owner: User;
	readonly members: readonly User[];
	readonly tasks: readonly Task[];
	readonly activity: readonly Event[];
}

const schema = <T>(check: (value: any) => boolean): StandardSchema<unknown, T> => ({
	'~standard': {
		version: 1,
		vendor: 'bench',
		validate: (value) =>
			check(value) ? { value: value as T } : { issues: [{ message: 'does not match' }] },
	},
});
const isId = (value: any) => typeof value?.id === 'string';
const listOf = (value: any) => Array.isArray(value) && value.every(isId);
const Id = schema<string>((value) => typeof value === 'string');

const ProjectEntity = entity('project', schema<Project>(isId));
const UserEntity = entity('user', schema<User>(isId));
const TaskEntity = entity('task', schema<Task>(isId));

export const project = read({
	name: 'project',
	input: Id,
	output: schema<Project>(isId),
	entities: (value) => ProjectEntity.from(value),
});
export const user = read({
	name: 'user',
	input: Id,
	output: schema<User>(isId),
	entities: (value) => UserEntity.from(value),
});
export const members = read({
	name: 'members',
	input: Id,
	output: schema<User[]>(listOf),
	entities: (list) => UserEntity.from(list),
});
export const tasks = read({
	name: 'tasks',
	input: Id,
	output: schema<Task[]>(listOf),
	entities: (list) => TaskEntity.from(list),
});
export const activity = read({
	name: 'activity',
	input: Id,
	output: schema<Event[]>(listOf),
});
export const dashboard = read({
	name: 'dashboard',
	input: Id,
	output: schema<Dashboard>((value) => isId(value?.project) && listOf(value?.tasks)),
	entities: (value) => [
		ProjectEntity.from(value.project),
		UserEntity.from([value.owner, ...value.members]),
		TaskEntity.from(value.tasks),
	],
});
