import type { QueryStore } from '@sanity/core-loader';
import { useEffect } from 'octane';

import type { UseLiveModeHook } from './types';

export function defineUseLiveMode({
	enableLiveMode,
	setStudioUrl,
}: Pick<QueryStore, 'enableLiveMode'> & {
	setStudioUrl: (
		studioUrl:
			| import('@sanity/client/csm').StudioUrl
			| import('@sanity/client/csm').ResolveStudioUrl
			| undefined,
	) => void;
}): UseLiveModeHook {
	return ({
		allowStudioOrigin,
		client,
		onConnect,
		onDisconnect,
		onPerspective,
		onVariant,
		studioUrl,
	}) => {
		useEffect(() => {
			if (allowStudioOrigin) {
				console.warn('`allowStudioOrigin` is deprecated and no longer needed');
			}
			const disableLiveMode = enableLiveMode({
				client,
				onConnect,
				onDisconnect,
				onPerspective,
				onVariant,
			});
			return () => disableLiveMode();
		}, [allowStudioOrigin, client, onConnect, onDisconnect, onPerspective, onVariant]);

		useEffect(() => {
			setStudioUrl(
				studioUrl ?? (typeof client === 'object' ? client?.config().stega.studioUrl : undefined),
			);
		}, [studioUrl, client]);
	};
}
