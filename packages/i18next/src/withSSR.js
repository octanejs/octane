// Ported from react-i18next@17.0.9 (8b4a9ea): descriptor creation -> octane.
import { createElement } from 'octane';
import { useSSR } from './useSSR.js';
import { composeInitialProps } from './context.js';
import { getDisplayName } from './utils.js';

export const withSSR = () =>
	function Extend(WrappedComponent) {
		function I18nextWithSSR({ initialI18nStore, initialLanguage, ...rest }) {
			useSSR(initialI18nStore, initialLanguage);

			return createElement(WrappedComponent, {
				...rest,
			});
		}

		I18nextWithSSR.getInitialProps = composeInitialProps(WrappedComponent);
		I18nextWithSSR.displayName = `withI18nextSSR(${getDisplayName(WrappedComponent)})`;
		I18nextWithSSR.WrappedComponent = WrappedComponent;

		return I18nextWithSSR;
	};
