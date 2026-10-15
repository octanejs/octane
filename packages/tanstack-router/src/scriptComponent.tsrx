'use strong';

import { trustHTML, useId } from 'octane';
import type { RouterManagedTag } from '@tanstack/router-core';
import { getAssetKeys } from './assetKeys.ts';

function scriptAttributes(attrs: RouterManagedTag['attrs']) {
	if (!attrs || !Object.prototype.hasOwnProperty.call(attrs, '__executeOnMount')) return attrs;
	const { __executeOnMount: _compilerMetadata, ...attributes } = attrs;
	return attributes;
}

// A direct host row leaves no item frame behind when router-core's transport
// scripts remove themselves before hydration.
// External scripts follow dynamic-insertion loading rules: neither array order
// nor a defer attribute serializes their execution after client navigation.
export function createScripts(useScripts: () => Array<RouterManagedTag>) {
	function Scripts() @{
		const owner = useId();
		const scripts = useScripts();
		const keys = getAssetKeys('body', owner, scripts);
		<>
			@for (const script of scripts; index position; key keys[position]!.assetKey) {
				<script
					{...scriptAttributes(script.attrs)}
					__executeOnMount
					data-tsr-managed-key={keys[position]!.managedKey}
					dangerouslySetInnerHTML={trustHTML(script.children ?? '')}
				/>
			}
		</>
	}
	return Scripts;
}
