// App shell: provide the QueryClient, then render the router inside it. Authored
// as .tsx so main.ts can stay a plain entry that just renders <App/>.
import { QueryClientProvider } from '@octanejs/query';
import { RouterProvider } from '@octanejs/router';
import { queryClient } from './queryClient.js';
import { router } from './routes.js';

export function App() {
	return (
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
		</QueryClientProvider>
	);
}
