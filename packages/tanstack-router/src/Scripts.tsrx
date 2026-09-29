import { createElement, useEffect, useId, useState } from 'octane';
import { isServer } from '@tanstack/router-core/isServer';
import type { RouterManagedTag } from '@tanstack/router-core';
import { getAssetKeys } from './assetKeys.ts';
import { useRouter } from './context.ts';
import { useScripts } from './scriptContentUtils.ts';

export function Scripts() @{
	const owner = useId();
	const router = useRouter();
	const scripts = useScripts();
	const [hydrating, setHydrating] = useState(true);
	useEffect(() => {
		setHydrating(false);
	}, []);
	const renderScripts: Array<RouterManagedTag> =
		!(isServer ?? router.isServer) && hydrating
			? [
					{
						tag: 'script',
						attrs: {
							nonce: router.options.ssr?.nonce,
							className: '$tsr',
							id: '$tsr-stream-barrier',
							suppressHydrationWarning: true,
						},
						children: '',
					},
					...scripts,
				]
			: scripts;
	const keys = getAssetKeys('body', owner, renderScripts);
	<>
		{renderScripts.map((script, index) => {
			const { assetKey, managedKey } = keys[index]!;
			return createElement('script', {
				...script.attrs,
				key: assetKey,
				'data-tsr-managed-key': managedKey,
				dangerouslySetInnerHTML: { __html: script.children ?? '' },
			});
		})}
	</>
}
