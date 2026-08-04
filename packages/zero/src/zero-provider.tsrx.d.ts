import type {
	BaseDefaultContext,
	BaseDefaultSchema,
	CustomMutatorDefs,
	DefaultContext,
	DefaultSchema,
	Zero,
	ZeroOptions,
} from '@rocicorp/zero';
import type { Context, OctaneNode } from 'octane';

export declare const ZeroContext: Context<Zero<any, any, any> | undefined>;

export declare function useZero<
	S extends BaseDefaultSchema = DefaultSchema,
	MD extends CustomMutatorDefs | undefined = undefined,
	TContext extends BaseDefaultContext = DefaultContext,
>(): Zero<S, MD, TContext>;

export declare function createUseZero<
	S extends BaseDefaultSchema = DefaultSchema,
	MD extends CustomMutatorDefs | undefined = undefined,
	TContext extends BaseDefaultContext = DefaultContext,
>(): () => Zero<S, MD, TContext>;

export type ZeroProviderProps<
	S extends BaseDefaultSchema = DefaultSchema,
	MD extends CustomMutatorDefs | undefined = undefined,
	TContext extends BaseDefaultContext = DefaultContext,
> = (ZeroOptions<S, MD, TContext> | { zero: Zero<S, MD, TContext> }) & {
	init?: (zero: Zero<S, MD, TContext>) => void;
	children: OctaneNode;
};

export declare function ZeroProvider<
	S extends BaseDefaultSchema = DefaultSchema,
	MD extends CustomMutatorDefs | undefined = undefined,
	TContext extends BaseDefaultContext = DefaultContext,
>(props: ZeroProviderProps<S, MD, TContext>): OctaneNode;
