import type { Context } from 'octane';
import type { ApolloClient } from '@apollo/client';
import type { HookWrappers, wrapperSymbol } from '@octanejs/apollo-client/react/internal';
export interface ApolloContextValue {
	client?: ApolloClient;
	[wrapperSymbol]?: HookWrappers;
}
export declare function getApolloContext(): Context<ApolloContextValue>;
