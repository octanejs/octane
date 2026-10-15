'use strong';

import { trustHTML, useId } from 'octane';
import type { RouterManagedTag } from '@tanstack/router-core';
import { getAssetKeys } from './assetKeys.ts';

// A direct host row leaves no item frame behind when router-core's transport
// scripts remove themselves before hydration.
export function createScripts(useScripts: () => Array<RouterManagedTag>) {
	function Scripts() @{
		const owner = useId();
		const scripts = useScripts();
		const keys = getAssetKeys('body', owner, scripts);
		<>
			@for (const script of scripts; index position; key keys[position]!.assetKey) {
				<script
					{...script.attrs}
					executeOnMount
					data-tsr-managed-key={keys[position]!.managedKey}
					dangerouslySetInnerHTML={trustHTML(script.children ?? '')}
				/>
			}
		</>
	}
	return Scripts;
}
