import type { ApolloClient, OperationVariables } from '@apollo/client';
import type { MaybeMasked } from '@apollo/client/masking';
import type { DecoratedPromise } from '@apollo/client/utilities/internal';
import type { FragmentKey } from './types.js';
type FragmentRefPromise<TData> = DecoratedPromise<TData>;
type Listener<TData> = (promise: FragmentRefPromise<TData>) => void;
interface FragmentReferenceOptions {
	autoDisposeTimeoutMs?: number;
	onDispose?: () => void;
}
export declare class FragmentReference<
	TData = unknown,
	TVariables extends OperationVariables = OperationVariables,
> {
	readonly observable: ApolloClient.ObservableFragment<TData | null>;
	readonly key: FragmentKey;
	promise: FragmentRefPromise<MaybeMasked<TData>>;
	private resolve;
	private reject;
	private subscription;
	private listeners;
	private autoDisposeTimeoutId?;
	private references;
	constructor(
		client: ApolloClient,
		watchFragmentOptions: ApolloClient.WatchFragmentOptions<TData, TVariables> & {
			from: string | null | Array<string | null>;
		},
		options: FragmentReferenceOptions,
	);
	listen(listener: Listener<MaybeMasked<TData>>): () => void;
	retain(): () => void;
	private dispose;
	private onDispose;
	private subscribeToFragment;
	private handleNext;
	private handleError;
	private deliver;
	private createPendingPromise;
}
export {};
