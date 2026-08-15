// Type declaration for the .tsrx provider component (ActorProvider.tsrx).
//
// A SPECIFIC module declaration resolved by relative path, never an ambient
// `declare module '*.tsrx'` — so it types only this module and cannot silence
// `.tsrx` resolution in a consumer's own program.
import type { ComponentBody, Context, OctaneNode } from 'octane';
import type { Actor, ActorOptions, AnyActorLogic } from 'xstate';

export declare const ActorProvider: ComponentBody<{
	context: Context<Actor<AnyActorLogic> | null>;
	logic: AnyActorLogic;
	options?: ActorOptions<AnyActorLogic>;
	children?: OctaneNode;
}>;
