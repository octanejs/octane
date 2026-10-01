import { createElement, useId } from 'octane';
import type { RouterManagedTag } from '@tanstack/router-core';
import { getAssetKeys } from './assetKeys.ts';
import { useScripts } from './scriptContentUtils.ts';

// router-core 1.171.34 owns the hydration-script lifecycle: the server appends
// the initial hydration tags (and the streaming boundary) through
// `useScripts()` / `takeInitialHydrationScriptTags()`, and those tags remove
// themselves (`document.currentScript.remove()`) as they run. By the time the
// client hydrates, the DOM holds only the body scripts, which is exactly what
// the client renders — so there is no client-only barrier to prepend (the former
// `$tsr-stream-barrier` belonged to the removed buffered-script model and left a
// client <script> the server never rendered).
export function Scripts() @{
	const owner = useId();
	const scripts: Array<RouterManagedTag> = useScripts();
	const keys = getAssetKeys('body', owner, scripts);
	<>
		{scripts.map((script, index) => {
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
