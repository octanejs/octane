import { createPortal, Suspense, use } from 'octane';
import { DbProvider, useDbClient } from '@octanejs/tanstack-db';
import type { DbClient } from '@tanstack/db';

type PortalProps = {
	client: DbClient;
	target: HTMLElement;
	fail: boolean;
	ready: Promise<string>;
};
function PortalReader(props: PortalProps) @{
	const client = useDbClient();
	const label = use(props.ready);
	if (props.fail) throw new Error('portal failure');
	<output id="portal-client">
		{client === props.client ? label : 'wrong client' as string}
	</output>
}
export function PortalDatabase(props: PortalProps) @{
	<DbProvider client={props.client}>
		@try {
			<Suspense fallback={<output id="portal-pending">Loading</output>}>{createPortal(
				<PortalReader {...props} />,
				props.target,
			)}</Suspense>
		} @catch (error) {
			<output id="portal-error">{(error as Error).message as string}</output>
		}
	</DbProvider>
}
