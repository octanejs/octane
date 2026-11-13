import type { StandardSchema } from 'octane/data';

/** A typed placeholder schema; the fixture never validates anything. */
export const schema = <T>(): StandardSchema<unknown, T> =>
	({
		'~standard': { version: 1, vendor: 'fixture', validate: (value: unknown) => ({ value }) },
	}) as any;
