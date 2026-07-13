import type { ComponentBody } from 'octane';
import {
	useTranslation,
	withTranslation,
	type IcuTransProps,
	type TransProps,
	type WithTranslation,
} from '@octanejs/i18next';

declare module 'i18next' {
	interface CustomTypeOptions {
		defaultNS: 'translation';
		resources: {
			translation: {
				welcome: string;
				account: { greeting: string };
			};
			common: {
				cta: string;
			};
		};
	}
}

const defaultTranslation = useTranslation();
defaultTranslation.t('welcome');
defaultTranslation.t('account.greeting');
// @ts-expect-error unknown keys stay rejected by i18next's typed resource map
defaultTranslation.t('missing');

const commonTranslation = useTranslation('common');
commonTranslation.t('cta');
// @ts-expect-error namespace-specific key inference is preserved
commonTranslation.t('welcome');

const transProps: TransProps<'welcome'> = { i18nKey: 'welcome' };
const icuProps: IcuTransProps<'welcome'> = {
	i18nKey: 'welcome',
	defaultTranslation: 'Hello',
	content: [],
};
void transProps;
void icuProps;

type InjectedProps = WithTranslation<'translation'> & { name: string };
const View = (() => {}) as ComponentBody<InjectedProps>;
const Enhanced = withTranslation('translation')(View);
const enhancedProps: Parameters<typeof Enhanced>[0] = { name: 'Ada' };
void enhancedProps;
