// Ported from react-i18next@17.0.9 (8b4a9ea): React primitives -> octane.
import { createElement, useMemo } from 'octane';
import { I18nContext } from './context.js';
import { S } from './internal.js';

export function I18nextProvider({ i18n, defaultNS, children }) {
	const value = useMemo(() => ({ i18n, defaultNS }), [i18n, defaultNS], S('I18nextProvider:value'));
	return createElement(I18nContext.Provider, { value }, children);
}
