import { Dexie } from 'dexie';
import { useObservable } from './useObservable';

type PermissionKeyPaths<T> = {
	[P in keyof T]: P extends string
		? T[P] extends readonly (infer K)[]
			? K extends object
				? P | `${P}.${number}` | `${P}.${number}.${PermissionKeyPaths<K>}`
				: P | `${P}.${number}`
			: T[P] extends (...args: any[]) => any
				? never
				: T[P] extends object
					? P | `${P}.${PermissionKeyPaths<T[P]>}`
					: P
		: never;
}[keyof T];

export type PermissionChecker<T, TableName extends string> = {
	add(...tableNames: TableName[]): boolean;
	update(...props: PermissionKeyPaths<T>[]): boolean;
	delete(): boolean;
};

type Entity = {
	table?: () => string;
	realmId?: string;
	owner?: string;
	db?: Dexie;
};

export function usePermissions<T extends Entity>(
	entity: T,
): PermissionChecker<T, T extends { table: () => infer Name } ? Extract<Name, string> : string>;
export function usePermissions<TDB extends Dexie, T>(
	db: TDB,
	table: string,
	obj: T,
): PermissionChecker<T, string>;
export function usePermissions(...rest: any[]) {
	const [args, slot] = (() => {
		const tail = rest[rest.length - 1];
		return typeof tail === 'symbol' ? [rest.slice(0, -1), tail as symbol] : [rest, undefined];
	})();
	const firstArg = args[0] as Entity | Dexie | undefined;
	if (!firstArg) throw new TypeError('Invalid arguments to usePermissions(): undefined or null');

	let db: Dexie;
	let table: string;
	let obj: Entity;
	if (args.length >= 3) {
		if (!('transaction' in firstArg)) {
			throw new TypeError(
				'Invalid arguments to usePermissions(db, table, obj): 1st arg must be a Dexie instance',
			);
		}
		if (typeof args[1] !== 'string') {
			throw new TypeError(
				'Invalid arguments to usePermissions(db, table, obj): 2nd arg must be string',
			);
		}
		if (!args[2] || typeof args[2] !== 'object') {
			throw new TypeError(
				'Invalid arguments to usePermissions(db, table, obj): 3rd arg must be an object',
			);
		}
		db = firstArg as Dexie;
		table = args[1];
		obj = args[2];
	} else if (
		typeof firstArg !== 'object' ||
		typeof (firstArg as Entity).table !== 'function' ||
		!(firstArg as Entity).db
	) {
		throw new TypeError(
			'Invalid arguments to usePermissions(). Expected a Dexie Cloud entity or (db, table, obj).',
		);
	} else {
		const entity = firstArg as Entity;
		db = entity.db!;
		table = entity.table!();
		obj = entity;
	}

	const cloud = (db as Dexie & { cloud?: { permissions: (obj: Entity, table: string) => unknown } })
		.cloud;
	if (!cloud) {
		throw new Error(
			"usePermissions() is only for Dexie Cloud but there's no dexie-cloud-addon active in the given db.",
		);
	}
	if (typeof cloud.permissions !== 'function') {
		throw new Error(
			'usePermissions() requires a newer version of dexie-cloud-addon. Please upgrade it.',
		);
	}
	return useObservable(
		() => cloud.permissions(obj, table) as any,
		[obj.realmId, obj.owner, table],
		undefined,
		slot,
	);
}
