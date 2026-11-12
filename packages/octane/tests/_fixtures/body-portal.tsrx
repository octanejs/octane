'use strong';

import { createPortal } from 'octane';

export function BodyPortalValue({ label }: { label: string }) {
	return createPortal(<b data-body-portal="">{label as string}</b>, 'body');
}

export function BodyPortalChild({ label }: { label: string }) @{
	<main>{createPortal(<b data-body-portal="">{label as string}</b>, 'body')}</main>
}
