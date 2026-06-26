// App shell: provide the QueryClient, then render the router inside it. Both the
// server and client build their OWN per-request router + QueryClient and pass
// them in (so SSR is request-isolated and hydration reuses the seeded cache).
// With no props it falls back to the browser singletons (back-compat).
import { QueryClientProvider } from '@octanejs/query';
import { RouterProvider } from '@octanejs/router';
import { queryClient as defaultQueryClient } from './queryClient.js';
import { router as defaultRouter } from './routes.js';

export function App(props: { router?: any; queryClient?: any } = {}) @{
	const router = props.router ?? defaultRouter;
	const queryClient = props.queryClient ?? defaultQueryClient;
	<QueryClientProvider client={queryClient}>
		<RouterProvider router={router} />
	</QueryClientProvider>
}
