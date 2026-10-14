// Compiler-owned use() sites. A thenable that a use() call creates directly,
// such as `use(load(id))`, compiles to `seedOrCreate(site, () => load(id))`
// (runtime.ts), so that hydration hands back the server's value without
// starting the request: the server records which positional seed each call of
// the site produced, and the factory runs only where none applies. The first
// such call that a hydration pass seeds installs this module, so a hydrating
// app without a compiled use() creation ships none of it. The positional seeds
// themselves stay with hydration: every use(thenable), and every thenable a
// component renders as a child, consumes them (HydrationCapability.useSeed).

/** A site call's seed position, and its factory, which runs at most once. */
export interface SeedFactory {
	index: number;
	factory: (() => unknown) | null;
	value?: unknown;
	error?: unknown;
	failed?: boolean;
}

/** Each site's seed positions, in render order, and how many of its calls have rendered. */
export interface SeedSites {
	queues: Map<string, number[]>;
	offsets: Map<string, number>;
}

const SEED_FACTORY = Symbol('octane.hydration.seed-factory');

interface SeedThenable extends PromiseLike<unknown> {
	[SEED_FACTORY]: SeedFactory;
	status?: 'pending' | 'fulfilled' | 'rejected';
	value?: unknown;
	reason?: unknown;
}

/**
 * The thenable for the next call of `site`. It carries the call's seed
 * position, which use() settles with the seed (HydrationCapability.useSeed),
 * or else runs the factory. A call whose seed lies before `cursor`, the next
 * seed position, or that has none, runs the factory now.
 */
export function seedSite<T>(sites: SeedSites, cursor: number, site: string, factory: () => T): T {
	const queue = sites.queues.get(site);
	if (queue === undefined) return factory();
	const offset = sites.offsets.get(site) ?? 0;
	sites.offsets.set(site, offset + 1);
	const index = queue[offset];
	if (index === undefined || index < cursor) return factory();
	const record: SeedFactory = { index, factory };
	const thenable: SeedThenable = {
		[SEED_FACTORY]: record,
		then(onFulfilled, onRejected) {
			if (thenable.status === 'fulfilled')
				return Promise.resolve(thenable.value).then(onFulfilled, onRejected);
			if (thenable.status === 'rejected')
				return Promise.reject(thenable.reason).then(onFulfilled, onRejected);
			return Promise.resolve(materializeSeedFactory(record)).then(onFulfilled, onRejected);
		},
	};
	return thenable as T;
}

/** The seed position and factory of a thenable that seedSite made. */
function seedFactoryOf(thenable: PromiseLike<unknown>): SeedFactory | undefined {
	try {
		return (thenable as SeedThenable)[SEED_FACTORY];
	} catch {
		return undefined;
	}
}

/** Run a site's factory where its seed does not apply, once, and return what it made. */
function materializeSeedFactory(record: SeedFactory): unknown {
	if (record.failed === true) throw record.error;
	if (record.factory !== null) {
		const factory = record.factory;
		record.factory = null;
		try {
			record.value = factory();
		} catch (error) {
			record.failed = true;
			record.error = error;
			throw error;
		}
	}
	return record.value;
}

/** What use() reads of a site's thenable, once seedSite has made one. */
export const SEED_SITE_DRIVER = {
	factoryOf: seedFactoryOf,
	materialize: materializeSeedFactory,
};

export type SeedSiteDriver = typeof SEED_SITE_DRIVER;
