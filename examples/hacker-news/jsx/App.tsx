// App shell: provide the QueryClient, then render the router inside it. Authored
// as .tsx so main.ts can stay a plain entry that just renders <App/>.
import { QueryClientProvider } from '@octane-ts/query';
import { RouterProvider } from '@octane-ts/router';
import { queryClient } from './queryClient.ts';
import { router } from './routes.ts';

export function App() {
	return (
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
		</QueryClientProvider>
	);
}
