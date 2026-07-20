import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { AsyncLocalStorage } from 'node:async_hooks';
import { getDatabaseConnectionString, isIsolateRuntime } from '~/server/runtime/host.server';
import * as schema from './schema';

type PostgresClient = ReturnType<typeof postgres>;
type Database = ReturnType<typeof drizzle<typeof schema>>;
type DatabaseContext = {
	client?: PostgresClient;
	connectionString: string;
	db?: Database;
};

// Lazy initialization to avoid throwing at module load time
let _client: PostgresClient | null = null;
let _db: Database | null = null;
const databaseStorage = new AsyncLocalStorage<DatabaseContext>();

function createPostgresClient(connectionString: string) {
	return postgres(connectionString, {
		max: isIsolateRuntime() ? 5 : 1,
		idle_timeout: 20,
		connect_timeout: 10,
		fetch_types: !isIsolateRuntime(),
	});
}

function createDatabase(connectionString: string) {
	const client = createPostgresClient(connectionString);
	return {
		client,
		db: drizzle(client, { schema }),
	};
}

function getDatabaseUrl() {
	const context = databaseStorage.getStore();
	const connectionString = context?.connectionString ?? process.env.DATABASE_URL;
	if (!connectionString) {
		throw new Error('DATABASE_URL environment variable is not set');
	}
	return connectionString;
}

function getRequestDb(context: DatabaseContext) {
	if (!context.db) {
		const database = createDatabase(context.connectionString);
		context.client = database.client;
		context.db = database.db;
	}

	return context.db;
}

function getDb() {
	const context = databaseStorage.getStore();
	if (context) {
		return getRequestDb(context);
	}

	if (isIsolateRuntime()) {
		return createDatabase(getDatabaseUrl()).db;
	}

	if (!_db) {
		const database = createDatabase(getDatabaseUrl());
		_client = database.client;
		_db = database.db;
	}
	return _db;
}

export async function runWithDatabaseContext<T>(fn: () => Promise<T>): Promise<T> {
	if (!isIsolateRuntime()) {
		return fn();
	}

	const connectionString = await getDatabaseConnectionString();
	if (!connectionString) {
		return fn();
	}

	return databaseStorage.run({ connectionString }, fn);
}

// Use a getter to lazily initialize db on first access
export const db = new Proxy({} as Database, {
	get(_target, prop, _receiver) {
		const realDb = getDb();
		const value = Reflect.get(realDb, prop, realDb);
		if (typeof value === 'function') {
			return value.bind(realDb);
		}
		return value;
	},
});

// Export schema for use in migrations and queries
export { schema };
