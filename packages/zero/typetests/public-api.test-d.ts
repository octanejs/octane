import type { Schema, Zero } from '@rocicorp/zero';
import {
	createUseZero,
	type MaybeQueryResult,
	type QueryResult,
	type UseQueryOptions,
	type ZeroProviderProps,
} from '@octanejs/zero';

declare const zero: Zero<Schema>;

const props: ZeroProviderProps<Schema> = {
	zero,
	children: 'content',
};

const useTypedZero = createUseZero<Schema>();
const selected: Zero<Schema> = useTypedZero();
const options: UseQueryOptions = { enabled: true, ttl: 'forever' };
const result = null as unknown as QueryResult<readonly { id: string }[]>;
const maybe = null as unknown as MaybeQueryResult<readonly { id: string }[]>;

void props;
void selected;
void options;
void result;
void maybe;
