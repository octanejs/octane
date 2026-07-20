import { useRouter } from '@tanstack/react-router';
import { TanStackDevtools } from '@tanstack/react-devtools';
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';

export function AppDevtools() {
	const router = useRouter();

	return (
		<TanStackDevtools
			config={{
				customTrigger: <span className="hidden" aria-hidden="true" />,
			}}
			plugins={[
				{
					name: 'TanStack Query',
					render: <ReactQueryDevtoolsPanel />,
				},
				{
					name: 'TanStack Router',
					render: <TanStackRouterDevtoolsPanel router={router} />,
				},
			]}
		/>
	);
}
