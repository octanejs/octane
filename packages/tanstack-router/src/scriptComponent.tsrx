import { createElement, useId } from 'octane';
import type { RouterManagedTag } from '@tanstack/router-core';
import { getAssetKeys } from './assetKeys.ts';

// router-core's initial hydration scripts remove themselves before adoption.
// Host descriptors leave no per-item template frames behind when they do, and
// create live script elements that execute on later client navigation. This
// shared owner intentionally remains outside Strong mode for both entries.
export function createScripts(useScripts: () => Array<RouterManagedTag>) {
	function Scripts() @{
		const owner = useId();
		const scripts = useScripts();
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
	return Scripts;
}
