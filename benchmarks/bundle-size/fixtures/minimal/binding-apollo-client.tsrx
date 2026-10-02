import { createRoot } from 'octane';
import { ApolloClient, ApolloLink, InMemoryCache } from '@octanejs/apollo-client';
import { ApolloProvider, useApolloClient } from '@octanejs/apollo-client/react';

const client = new ApolloClient({ cache: new InMemoryCache(), link: ApolloLink.empty() });

function ClientProbe() @{
	const observed = useApolloClient();
	<output id="minimal-apollo-client">{observed === client ? 'provided' : 'missing'}</output>
}

function ApolloRoot() @{
	<ApolloProvider client={client}>
		<ClientProbe />
	</ApolloProvider>
}

// The compiler specializes this local root. The binding must not force the
// generic public root back in by materializing the whole `octane` namespace.
export function run(container: HTMLElement) {
	const root = createRoot(container);
	root.render(ApolloRoot);
	const text = container.querySelector('#minimal-apollo-client')?.textContent;
	root.unmount();
	return { text, cleaned: container.childNodes.length === 0 };
}
