// Ported from react-i18next@17.0.9 (8b4a9ea): octane uses ref-as-prop.
import { createElement } from 'octane';
import { useTranslation } from './useTranslation.js';
import { getDisplayName } from './utils.js';
import { S } from './internal.js';

export const withTranslation = (ns, options = {}) =>
	function Extend(WrappedComponent) {
		function I18nextWithTranslation({ forwardedRef, ref, ...rest }) {
			const [t, i18n, ready] = useTranslation(
				ns,
				{ ...rest, keyPrefix: options.keyPrefix },
				S('withTranslation:useTranslation'),
			);

			const passDownProps = {
				...rest,
				t,
				i18n,
				tReady: ready,
			};
			const resolvedRef = ref || forwardedRef;
			if (options.withRef && resolvedRef) {
				passDownProps.ref = resolvedRef;
			} else if (!options.withRef && forwardedRef) {
				passDownProps.forwardedRef = forwardedRef;
			}
			return createElement(WrappedComponent, passDownProps);
		}

		I18nextWithTranslation.displayName = `withI18nextTranslation(${getDisplayName(
			WrappedComponent,
		)})`;

		I18nextWithTranslation.WrappedComponent = WrappedComponent;

		return I18nextWithTranslation;
	};
