import { createElement, useEffect, useId, useState } from 'octane';
import { isServer } from '@tanstack/router-core/isServer';
import { getAssetKey, getManagedAssetKey } from './assetKeys.ts';
import { useRouter } from './context.ts';
import { useScripts } from './scriptContentUtils.ts';
import type { ScriptRenderAsset } from './scriptContentUtils.ts';
import { Asset } from './Asset.tsrx';

export function Scripts() @{
	const owner = useId();
	const router = useRouter();
	const scripts = useScripts();
	const [hydrating, setHydrating] = useState(true);
	useEffect(() => {
		setHydrating(false);
	}, []);
	const renderScripts: Array<ScriptRenderAsset> =
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
	<>
		{renderScripts.map((script, index) => {
			const assetKey = getAssetKey('body', script, index);
			// The streamed bootstrap stays in the native tree until hydration has
			// adopted its barrier. Ordinary assets use the shared script lifecycle.
			if (script.attrs?.id === '$tsr-stream-barrier') {
				return createElement('script', {
					...script.attrs,
					key: assetKey,
					dangerouslySetInnerHTML: { __html: script.children ?? '' },
				});
			}
			return createElement(Asset, {
				...script,
				attrs: {
					...script.attrs,
					'data-tsr-managed-key': getManagedAssetKey('body', owner, index),
				},
				key: assetKey,
			});
		})}
	</>
}
