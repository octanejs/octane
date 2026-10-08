import { QueryClient, QueryClientProvider } from '@octanejs/tanstack-query';
import { ReactQueryDevtools, ReactQueryDevtoolsPanel } from '../../src/production';

const client = new QueryClient();

export function ServerDevtools() @{
	<QueryClientProvider client={client}>
		<ReactQueryDevtools />
		<ReactQueryDevtoolsPanel style={{ height: '200px' }} />
	</QueryClientProvider>
}
