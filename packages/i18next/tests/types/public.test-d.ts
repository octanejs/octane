import { expectTypeOf } from 'vitest';
import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions';
import type { ComponentBody, ElementDescriptor } from 'octane';
import * as port from '@octanejs/i18next';
import * as portTrans from '@octanejs/i18next/TransWithoutContext';
import * as portInit from '@octanejs/i18next/initReactI18next';
import * as upstream from 'react-i18next';
import * as upstreamTrans from 'react-i18next/TransWithoutContext';
import * as upstreamInit from 'react-i18next/initReactI18next';

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

// Octane compatibility aliases (binding-only exports; witnessed against the
// previous binding's declarations).
expectTypeOf<port.OctaneNode>().toBeUnknown();
type _OctaneElement = Assert<
	Equal<port.OctaneElement<{ id: string }>, ElementDescriptor<{ id: string }>>
>;
type _OctaneComponent = Assert<
	Equal<port.OctaneComponentType<{ id: string }>, ComponentBody<{ id: string }>>
>;

// Error surfaces carry the upstream warning contract. OCTANE divergence: the
// binding retains two extra codes for Octane-only failure modes (flowing into
// ErrorMeta/ErrorArgs).
expectTypeOf<port.ErrorArgs[0]>().toExtend<string>();
expectTypeOf<port.ErrorCode>().toExtend<string>();
type _ErrorCodeExtra = Assert<
	Equal<
		Exclude<port.ErrorCode, upstream.ErrorCode>,
		'OCTANE_TRANS_BLOCK_CHILDREN' | 'ICU_TRANS_RENDER_ERROR'
	>
>;
type _ErrorCodeSuperset = Assert<
	Equal<upstream.ErrorCode extends port.ErrorCode ? true : false, true>
>;

// Namespace/key generics preserve upstream inference.
type _FallbackNs = Assert<Equal<port.FallbackNs<'common'>, upstream.FallbackNs<'common'>>>;
expectTypeOf<port.UseTranslationOptions<'ns'>>().toBeObject();
expectTypeOf<port.UseTranslationResponse<'translation', undefined>>().toBeArray();
expectTypeOf<port.TranslationProps>().toHaveProperty('children');
expectTypeOf<port.TranslationProps<'translation'>>().toHaveProperty('ns');

// Trans props carry the upstream surface with Octane children.
expectTypeOf<port.TransProps<'welcome'>>().toHaveProperty('i18nKey');
type _TransKey = Assert<
	Equal<port.TransProps<'welcome'>['i18nKey'], upstream.TransProps<'welcome'>['i18nKey']>
>;
expectTypeOf<port.TransSelectorProps<'welcome'>>().toHaveProperty('t');
expectTypeOf<port.IcuTransContentDeclaration>().toHaveProperty('type');
expectTypeOf<NonNullable<port.IcuTransContentDeclaration['props']>>().toHaveProperty('children');
type _IcuDeclarationType = Assert<
	Equal<
		Extract<port.IcuTransContentDeclaration['type'], string>,
		Extract<upstream.IcuTransContentDeclaration['type'], string>
	>
>;
expectTypeOf<port.IcuTransProps<'welcome'>>().toHaveProperty('i18nKey');
expectTypeOf<port.IcuTransWithoutContextProps<'welcome'>>().toHaveProperty('i18nKey');
expectTypeOf<port.IcuTransComponent>().toBeFunction();
expectTypeOf<port.IcuTransWithoutContextComponent>().toBeFunction();

// withTranslation injection surface.
expectTypeOf<port.WithTranslation>().toHaveProperty('t');
expectTypeOf<port.WithTranslation>().toHaveProperty('i18n');
expectTypeOf<port.WithTranslationProps>().toHaveProperty('useSuspense');

// Provider props keep the upstream members (i18n instance, children).
expectTypeOf<port.I18nextProviderProps>().toHaveProperty('i18n');
type _ProviderI18n = Assert<
	Equal<port.I18nextProviderProps['i18n'], upstream.I18nextProviderProps['i18n']>
>;

// Runtime exports: callable components, hooks, and the i18next plugin object.
expectTypeOf(port.Trans).toBeFunction();
expectTypeOf(port.TransWithoutContext).toBeFunction();
expectTypeOf(port.IcuTrans).toBeFunction();
expectTypeOf(port.IcuTransWithoutContext).toBeFunction();
expectTypeOf(port.I18nextProvider).toBeFunction();
expectTypeOf(port.Translation).toBeFunction();
expectTypeOf(port.useTranslation).toBeFunction();
expectTypeOf(port.withTranslation).toBeFunction();
expectTypeOf(port.withSSR).toBeFunction();
expectTypeOf(port.useSSR).toBeFunction();
expectTypeOf(port.initReactI18next).toBeObject();
expectTypeOf(port.setDefaults).toBeFunction();
expectTypeOf(port.getDefaults).toBeFunction();
expectTypeOf(port.setI18n).toBeFunction();
expectTypeOf(port.getI18n).toBeFunction();
expectTypeOf(port.composeInitialProps).toBeFunction();
expectTypeOf(port.getInitialProps).toBeFunction();
expectTypeOf(port.nodesToString).toBeFunction();
expectTypeOf(port.I18nContext).toBeObject();
expectTypeOf<port.ReportNamespaces>().toHaveProperty('addUsedNamespaces');

// Subpath entry `@octanejs/i18next/TransWithoutContext`: the same declarations
// the root re-exports, plus the selector/legacy call signatures and error
// metadata the root does not surface.
expectTypeOf<portTrans.TransProps<'welcome'>>().toHaveProperty('i18nKey');
expectTypeOf<portTrans.TransSelectorProps<'welcome'>>().toHaveProperty('t');
expectTypeOf<portTrans.TransLegacy>().toBeFunction();
expectTypeOf<portTrans.TransSelector>().toBeFunction();
expectTypeOf(portTrans.Trans).toBeFunction();
expectTypeOf(portTrans.nodesToString).toBeFunction();
expectTypeOf<portTrans.ErrorCode>().toExtend<string>();
expectTypeOf<portTrans.ErrorArgs[0]>().toExtend<string>();
expectTypeOf<portTrans.ErrorMeta>().toHaveProperty('code');
type _SubMetaCode = Assert<Equal<portTrans.ErrorMeta['code'], portTrans.ErrorCode>>;
type _SubUpstreamErrorArgs = Assert<
	Equal<
		Exclude<portTrans.ErrorCode, upstreamTrans.ErrorCode>,
		'OCTANE_TRANS_BLOCK_CHILDREN' | 'ICU_TRANS_RENDER_ERROR'
	>
>;

// OCTANE divergence: the subpath's helper aliases surface alongside the public
// Trans machinery. `TransChild` is intentionally `unknown` — Octane renderables
// are not React nodes (children-typing divergence).
expectTypeOf<portTrans.TransChild>().toBeUnknown();
expectTypeOf<portTrans._DefaultNamespace>().toExtend<string>();
expectTypeOf<portTrans._KeySeparator>().not.toBeNever();
expectTypeOf<portTrans._EnableSelector>().not.toBeNever();
expectTypeOf<portTrans._AppendKeyPrefix<'welcome', 'common'>>().not.toBeNever();
expectTypeOf<portTrans.$NoInfer<string>>().toExtend<string>();

// Subpath entry `@octanejs/i18next/initReactI18next`: the i18next plugin object.
expectTypeOf(portInit.initReactI18next).toBeObject();
expectTypeOf(portInit.initReactI18next).toEqualTypeOf(port.initReactI18next);
expectTypeOf(upstreamInit.initReactI18next).toBeObject();

// Typed t() inference under the declared resource map.
const defaultTranslation = port.useTranslation();
defaultTranslation.t('welcome');
defaultTranslation.t('account.greeting');
// @ts-expect-error unknown keys stay rejected by i18next's typed resource map
defaultTranslation.t('missing');

const commonTranslation = port.useTranslation('common');
commonTranslation.t('cta');
// @ts-expect-error namespace-specific key inference is preserved
commonTranslation.t('welcome');

const transProps: port.TransProps<'welcome'> = { i18nKey: 'welcome' };
const icuProps: port.IcuTransProps<'welcome'> = {
	i18nKey: 'welcome',
	defaultTranslation: 'Hello',
	content: [],
};
void transProps;
void icuProps;

type InjectedProps = port.WithTranslation<'translation'> & { name: string };
const View = (() => {}) as ComponentBody<InjectedProps>;
const Enhanced = port.withTranslation('translation')(View);
const enhancedProps: Parameters<typeof Enhanced>[0] = { name: 'Ada' };
void enhancedProps;
