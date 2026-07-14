import type { ApolloClient } from '@apollo/client';
import type { SuspenseCacheOptions } from '@octanejs/apollo-client/react/internal';
import { SuspenseCache } from './SuspenseCache.js';
declare module '@apollo/client' {
	namespace ApolloClient {
		interface DefaultOptions {
			react?: {
				suspense?: Readonly<SuspenseCacheOptions>;
			};
		}
		namespace DefaultOptions {
			interface Input {
				react?: {
					suspense?: Readonly<SuspenseCacheOptions>;
				};
			}
		}
	}
}
declare const suspenseCacheSymbol: unique symbol;
export declare function getSuspenseCache(
	client: ApolloClient & {
		[suspenseCacheSymbol]?: SuspenseCache;
	},
): SuspenseCache;
export {};
