/** @jsxImportSource octane */
// Ported from adobe/react-spectrum@1c84a49a1faf50b571c84e00bcf9c60b22ddd03e (packages/react-aria/src/datepicker/useDisplayNames.ts).
/*
 * Copyright 2020 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import intlMessages from '../intl/datepicker/index';
import { LocalizedStringDictionary } from '@internationalized/string';
import { useLocale } from '../i18n/I18nProvider';
import { useLocalizedStringDictionary } from '../i18n/useLocalizedStringFormatter';
import { useMemo } from '../compat/react';

type Field = Intl.DateTimeFormatPartTypes;
interface DisplayNames {
	of(field: Field): string | undefined;
}

/** @private */
export function useDisplayNames(): DisplayNames {
	let { locale } = useLocale();
	let dictionary = useLocalizedStringDictionary(intlMessages, '@react-aria/datepicker');
	return useMemo(() => {
		// Try to use Intl.DisplayNames if possible. It may be supported in browsers, but not support the dateTimeField
		// type as that was only added in v2. https://github.com/tc39/intl-displaynames-v2
		try {
			return new Intl.DisplayNames(locale, { type: 'dateTimeField' });
		} catch {
			return new DisplayNamesPolyfill(locale, dictionary);
		}
	}, [locale, dictionary]);
}

class DisplayNamesPolyfill implements DisplayNames {
	private locale: string;
	private dictionary: LocalizedStringDictionary<any, any>;

	constructor(locale: string, dictionary: LocalizedStringDictionary<any, any>) {
		this.locale = locale;
		this.dictionary = dictionary;
	}

	of(field: Field): string {
		return this.dictionary.getStringForLocale(field, this.locale) as string;
	}
}
