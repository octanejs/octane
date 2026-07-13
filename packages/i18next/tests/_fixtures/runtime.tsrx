import { Suspense } from 'octane';
import {
	I18nextProvider,
	IcuTrans,
	Trans,
	Translation,
	useSSR,
	useTranslation,
	withTranslation,
} from '@octanejs/i18next';

export function HookApp(props) @{
	const { t, ready } = useTranslation('translation', {
		i18n: props.i18n,
		useSuspense: false,
	});
	<div>
		<p id="hook-value">
			{t('welcome', { name: props.name }) as string}
		</p>
		<p id="hook-ready">{String(ready)}</p>
		<button id="fr" onClick={() => props.i18n.changeLanguage('fr')}>{'French'}</button>
	</div>
}

export function MultipleHooksApp(props) @{
	const { t: translateDefault } = useTranslation('translation', {
		i18n: props.i18n,
		useSuspense: false,
	});
	const { t: translateCommon } = useTranslation('common', {
		i18n: props.i18n,
		useSuspense: false,
	});
	<div>
		<p id="multi-default">
			{translateDefault('welcome', { name: 'Ada' }) as string}
		</p>
		<p id="multi-common">
			{translateCommon('action') as string}
		</p>
	</div>
}

function ProviderConsumer() @{
	const { t } = useTranslation();
	<p id="provider-value">
		{t('welcome', { name: 'Ada' }) as string}
	</p>
}

export function ProviderApp(props) @{
	<I18nextProvider i18n={props.i18n} defaultNS="translation">
		<ProviderConsumer />
	</I18nextProvider>
}

export function TransApp(props) @{
	<div>
		<p id="trans-value">
			<Trans
				i18n={props.i18n}
				i18nKey="rich"
				values={{ name: props.name }}
				components={{ strong: <strong class="emphasis" /> }}
			/>
		</p>
		<p id="trans-children">
			<Trans
				i18n={props.i18n}
				i18nKey="richIndexed"
				children={<>
					Hello
					<strong>
						{{ name: props.name }}
					</strong>
				</>}
			/>
		</p>
	</div>
}

export function BlockChildrenApp(props) @{
	<Trans i18n={props.i18n} i18nKey="rich">
		Fallback
		<strong>source</strong>
	</Trans>
}

function WrappedView(props) @{
	<p id="hoc-value">
		{props.t('welcome', { name: props.name }) as string}
	</p>
}

const WrappedTranslation = withTranslation('translation')(WrappedView);

export function ComponentApisApp(props) @{
	<I18nextProvider i18n={props.i18n}>
		<div>
			<Translation
				ns="translation"
				children={(t) => <p id="render-prop">
					{t('welcome', { name: props.name }) as string}
				</p>}
			/>
			<WrappedTranslation name={props.name} />
		</div>
	</I18nextProvider>
}

function IcuLink(props) @{
	<a class="icu-link" href={props.href}>{props.children}</a>
}

export function IcuApp(props) @{
	<div>
		<p id="icu-value">
			<IcuTrans
				i18n={props.i18n}
				i18nKey="icu"
				defaultTranslation="Welcome <0>friend</0>!"
				content={[
					{ type: 'strong', props: { class: 'icu-emphasis' } },
				]}
			/>
		</p>
		<p id="icu-component">
			<IcuTrans
				i18n={props.i18n}
				i18nKey="icuLink"
				defaultTranslation="Read <0>the guide</0>"
				content={[
					{ type: IcuLink, props: { href: '/guide' } },
				]}
			/>
		</p>
	</div>
}

function AsyncConsumer(props) @{
	const { t } = useTranslation('lazy', { i18n: props.i18n });
	<p id="async-value">
		{t('key1') as string}
	</p>
}

export function SuspenseApp(props) @{
	<Suspense fallback={<p id="loading">Loading</p>}>
		<AsyncConsumer i18n={props.i18n} />
	</Suspense>
}

export function SSRSeedApp(props) @{
	useSSR(props.initialStore, 'fr', { i18n: props.i18n });
	const { t } = useTranslation('translation', {
		i18n: props.i18n,
		useSuspense: false,
	});
	<p id="seeded-value">
		{t('seeded') as string}
	</p>
}
