'use strong';

import { createContext, useContext, useMemo, type OctaneNode } from 'octane';
import { ReactCompat } from 'octane/react';
import type { ChildrenBlock } from 'octane/tsrx-boundary';
import { createElement as reactElement, Fragment, type ReactNode } from 'react';
import {
	createIntl,
	createIntlCache,
	FormattedMessage as ReactMessage,
	IntlContext,
	type IntlConfig,
	type IntlShape,
	type MessageDescriptor,
} from 'react-intl';

type Children = { children?: OctaneNode | ChildrenBlock };
const absent = Symbol('no native Intl provider');
const Locale = createContext<IntlShape | null | undefined | typeof absent>(absent);
export const intlContexts = [{ source: Locale, target: IntlContext }];

export function useIntl(): IntlShape {
	const native = useContext(Locale);
	const intl = native === absent ? useContext(IntlContext) : native;
	if (!intl) {
		throw new Error(
			'[React Intl] Could not find required `intl` object. <IntlProvider> needs to exist in the component ancestry.',
		);
	}
	return intl;
}

export function RawIntlProvider({
	value,
	children,
}: Children & { value: IntlShape | null | undefined }) @{
	<Locale value={value}>{children}</Locale>
}

export function IntlBoundary({ children }: Children) @{
	const value = useIntl();
	<Locale value={value}>{children}</Locale>
}

export function IntlProvider({
	children,
	locale,
	messages,
	timeZone,
	formats,
	defaultLocale,
	defaultFormats,
	fallbackOnEmptyString,
	onError,
	onWarn,
	textComponent,
	wrapRichTextChunksInFragment,
	defaultRichTextElements,
}: Children & IntlConfig) @{
	const cache = useMemo(() => createIntlCache());
	const intl = useMemo(() => {
		const options = {
			messages,
			timeZone,
			formats,
			defaultLocale,
			defaultFormats,
			fallbackOnEmptyString,
			onError,
			onWarn,
			textComponent,
			wrapRichTextChunksInFragment,
			defaultRichTextElements,
		};
		// Omitting undefined options lets React Intl apply its own defaults.
		const provided = Object.fromEntries(
			Object.entries(options).filter(([, value]) => value !== undefined),
		);
		return createIntl({ locale, ...provided }, cache);
	});
	<Locale value={intl}>{children}</Locale>
}

type MessageProps = MessageDescriptor & { ignoreTag?: boolean };

function ReactContent({ content }: { content: ReactNode }) {
	return content;
}

export function FormattedMessage({ id, defaultMessage, description, ignoreTag }: MessageProps) @{
	const intl = useIntl();
	const descriptor = { id, defaultMessage, description };
	const { textComponent, formatMessage } = intl;
	// React owns custom wrappers and rich messages. Give it the real formatter.
	const requiresReact =
		(textComponent && textComponent !== Fragment) || intl.defaultRichTextElements;
	const content = requiresReact
		? reactElement(ReactMessage, { ...descriptor, ignoreTag })
		: formatMessage(descriptor, undefined, { ignoreTag });
	if (typeof content === 'string') return content;
	<Locale value={intl}>
		<ReactCompat component={ReactContent} props={{ content }} contexts={intlContexts} />
	</Locale>
}
