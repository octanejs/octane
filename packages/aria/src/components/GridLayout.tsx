/** @jsxImportSource octane */
// Ported from adobe/react-spectrum@1c84a49a1faf50b571c84e00bcf9c60b22ddd03e (packages/react-aria-components/src/GridLayout.ts).
/*
 * Copyright 2024 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import {
	GridLayout as BaseGridLayout,
	GridLayoutOptions,
} from '../upstream-exports/react-stately/useVirtualizerState';
import { LayoutOptionsDelegate } from './Virtualizer';
import { useLocale } from '../upstream-exports/react-aria/I18nProvider';
import { useMemo } from '../compat/react';

export class GridLayout<T, O extends GridLayoutOptions = GridLayoutOptions>
	extends BaseGridLayout<T, O>
	implements LayoutOptionsDelegate<GridLayoutOptions>
{
	// Automatically determine the layout direction from the current locale.
	useLayoutOptions(): GridLayoutOptions {
		/* eslint-disable react-hooks/rules-of-hooks */
		let { direction } = useLocale();
		return useMemo(() => ({ direction }), [direction]);
	}
}
