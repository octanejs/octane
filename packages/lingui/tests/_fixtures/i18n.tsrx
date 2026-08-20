import { useCallback, useMemo, useState } from 'octane';
import type { I18n } from '@lingui/core';
import { useLingui, type TransRenderProps } from '../../src/index.ts';

export let staticRenderCount = 0;
export let dynamicRenderCount = 0;
export let memoRenderCount = 0;

export function resetI18nFixtureCounts() {
	staticRenderCount = 0;
	dynamicRenderCount = 0;
	memoRenderCount = 0;
}

export function WithoutLinguiHook(props: { i18n: I18n; 'data-testid': string }) {
	staticRenderCount++;
	return <div data-testid={props['data-testid']}>{props.i18n.locale as string}</div>;
}

export function WithLinguiHook(props: { 'data-testid': string }) {
	const { i18n } = useLingui();
	dynamicRenderCount++;
	return <div data-testid={props['data-testid']}>{i18n.locale as string}</div>;
}

export function CurrentLocaleStatic(props: { i18n: I18n }) {
	return <span data-testid="static">{'1_' + props.i18n.locale as string}</span>;
}

export function CurrentLocaleContextConsumer() {
	const { i18n } = useLingui();
	return <span data-testid="dynamic">{'2_' + i18n.locale as string}</span>;
}

export function CurrentLocaleChild() {
	const { i18n } = useLingui();
	memoRenderCount++;
	return <span data-testid="child">{i18n.locale as string}</span>;
}

export function ComponentWithMemo(props: { greetingId: string }) {
	const { _ } = useLingui();
	const message = useMemo(function readGreeting() {
		return _(props.greetingId);
	}, [_]);
	return <div>{message as string}</div>;
}

export function GreetingConsumer(props: { greetingId: string }) {
	const { _ } = useLingui();
	return <div>{_(props.greetingId) as string}</div>;
}

export function DefaultComponentConsumer() {
	const { defaultComponent: DefaultComponent } = useLingui();
	if (!DefaultComponent) return null;
	return <DefaultComponent id="x" translation="x">
		x
	</DefaultComponent>;
}

export function ComponentWithMemoizedI18n() {
	const { i18n } = useLingui();

	const getLocale = useCallback(function readLocale(i18nInstance: I18n) {
		return i18nInstance.locale;
	}, []);
	const currentLocale = useMemo(function memoLocale() {
		return getLocale(i18n);
	}, [getLocale, i18n]);

	return <div data-testid="locale">{currentLocale as string}</div>;
}

export function ComponentFC(props: TransRenderProps) {
	const [state] = useState('value');
	return <div id={props.id as string}>{state}</div>;
}

export function DefaultComponent(props: TransRenderProps) {
	return <>
		<div data-testid="children">{props.children}</div>
		{props.id ? <div data-testid="id">{props.id as string}</div> : null}
		{props.message ? <div data-testid="message">{props.message as string}</div> : null}
		{props.translation ? <div data-testid="translation">{props.translation}</div> : null}
	</>;
}

export function DefaultComponentFC(props: TransRenderProps) {
	return <div>{props.children}</div>;
}
