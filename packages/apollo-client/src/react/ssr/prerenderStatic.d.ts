import type {
	ApolloClient,
	DocumentNode,
	ObservableQuery,
	OperationVariables,
} from '@apollo/client';
import type { OctaneNode } from 'octane';
import type { RenderResult } from 'octane/server';

export interface PrerenderStaticInternalContext {
	getObservableQuery(
		query: DocumentNode,
		variables?: Record<string, unknown>,
	): ObservableQuery | undefined;
	onCreatedObservableQuery(
		observable: ObservableQuery,
		query: DocumentNode,
		variables: OperationVariables,
	): void;
}

export declare namespace prerenderStatic {
	type ServerTree = OctaneNode | (() => OctaneNode);
	type PrerenderFunction = (
		component: () => OctaneNode,
	) => string | RenderResult | PromiseLike<string | RenderResult>;

	interface Options<Prerender extends PrerenderFunction = PrerenderFunction> {
		tree: ServerTree;
		context?: { client?: ApolloClient };
		renderFunction: Prerender;
		signal?: AbortSignal;
		ignoreResults?: boolean;
		diagnostics?: boolean;
		maxRerenders?: number;
	}

	interface Diagnostics {
		renderCount: number;
	}

	interface Result<Prerender extends PrerenderFunction = PrerenderFunction> {
		result: string;
		renderFnResult: Awaited<ReturnType<Prerender>>;
		aborted: boolean;
		diagnostics?: Diagnostics;
	}
}

export declare function prerenderStatic<
	Prerender extends prerenderStatic.PrerenderFunction = prerenderStatic.PrerenderFunction,
>(options: prerenderStatic.Options<Prerender>): Promise<prerenderStatic.Result<Prerender>>;
