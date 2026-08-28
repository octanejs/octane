import { createContext, isChildrenBlock, useContext, type OctaneNode } from 'octane';
import type { Client } from '@urql/core';
import { splitSlot } from './internal';

const OBJ = {};

/** `urql`'s Octane Context.
 *
 * @remarks
 * The Context that `urql`’s {@link Client} will be provided with.
 * You may use the reexported {@link Provider} to provide a `Client` as well.
 */
export const Context = createContext<Client | object>(OBJ);

/** Provider for `urql`'s {@link Client} to GraphQL hooks. */
export const Provider = Context.Provider;

/**
 * Consumer component, providing the {@link Client} from a parent Provider.
 *
 * OCTANE DIVERGENCE: Octane has no Context.Consumer render-prop on the context
 * object. This is a function component that reads with `useContext` and calls
 * `children(client)`.
 */
export function Consumer(
	props: { children: OctaneNode | ((client: Client) => OctaneNode) },
	...rest: unknown[]
): OctaneNode {
	splitSlot(rest);
	const client = useClient();
	const children = props.children;
	return typeof children === 'function' && !isChildrenBlock(children) ? children(client) : children;
}

/** Hook returning a {@link Client} from {@link Context}. */
export function useClient(...rest: [slot?: symbol]): Client {
	splitSlot(rest);
	const client = useContext(Context);

	if (client === OBJ && process.env.NODE_ENV !== 'production') {
		const error =
			"No client has been specified using urql's Provider. please create a client and add a Provider.";

		console.error(error);
		throw new Error(error);
	}

	return client as Client;
}
