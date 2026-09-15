import { useTranslation } from './useTranslation.js';
import { S } from './internal.js';

export const Translation = ({ ns, children, ...options }) => {
	const [t, i18n, ready] = useTranslation(ns, options, S('Translation:useTranslation'));

	return children(
		t,
		{
			i18n,
			lng: i18n?.language,
		},
		ready,
	);
};
