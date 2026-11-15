'use strong';

import { createContext, memo, useContext, useMemo, type OctaneNode } from 'octane';
import { ReactCompat } from 'octane/react';
import type { ChildrenBlock } from 'octane/tsrx-boundary';
import {
	createElement as reactElement,
	Fragment,
	type ComponentProps,
	type ReactNode,
} from 'react';
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

type MessageProps = MessageDescriptor &
	Pick<ComponentProps<typeof ReactMessage>, 'values' | 'ignoreTag'> & {
		inlineHost?: typeof ReactCompat;
	};

function ReactContent({ content }: { content: ReactNode }) {
	return content;
}

type MessagePart = string | number | bigint | boolean | null | undefined;

function isMessagePart(value: unknown): value is MessagePart {
	return (
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'bigint' ||
		typeof value === 'boolean' ||
		value === null ||
		value === undefined
	);
}

function plainMessageParts(value: unknown): MessagePart[] | undefined {
	if (
		!Array.isArray(value) ||
		Object.getPrototypeOf(value) !== Array.prototype ||
		Object.hasOwn(value, '$$typeof') ||
		Object.hasOwn(value, 'then')
	)
		return;
	// Copy dense data parts without calling methods or getters on custom formatter output.
	const parts: MessagePart[] = [];
	for (let i = 0, length = value.length; i < length; i++) {
		const part = Object.getOwnPropertyDescriptor(value, i);
		if (!part || !Object.hasOwn(part, 'value') || !isMessagePart(part.value)) return;
		parts.push(part.value);
	}
	return parts;
}

function NativeFormattedMessage(props: MessageProps) @{
	const { id, defaultMessage, description, values, ignoreTag } = props;
	const intl = useIntl();
	const descriptor = { id, defaultMessage, description };
	const { textComponent, formatMessage } = intl;
	// React owns custom wrappers and rich messages. Give it the real formatter.
	const requiresReact =
		(textComponent && textComponent !== Fragment) || intl.defaultRichTextElements;
	const content = requiresReact
		? reactElement(ReactMessage, { ...descriptor, values, ignoreTag })
		: formatMessage(descriptor, values, { ignoreTag });
	if (isMessagePart(content)) return content;
	const parts = plainMessageParts(content);
	if (parts) return parts;
	const Island = Object.hasOwn(props, 'inlineHost')
		? (props.inlineHost ?? ReactCompat)
		: ReactCompat;
	<Locale value={intl}>
		<Island component={ReactContent} props={{ content }} contexts={intlContexts} />
	</Locale>
}

function equalOwnValues<T extends object>(before: T | undefined, after: T | undefined): boolean {
	if (before === after) return true;
	if (!before || !after) return false;
	const keys = Object.keys(before) as (keyof T)[];
	if (keys.length !== Object.keys(after).length) return false;
	for (const key of keys) {
		if (before[key] !== after[key] || !Object.hasOwn(after, key)) return false;
	}
	return true;
}

function equalMessages(previous: Readonly<MessageProps>, next: Readonly<MessageProps>): boolean {
	const { values, ...message } = previous;
	const { values: nextValues, ...nextMessage } = next;
	// React Intl compares its values separately with strict equality (including ±0 and NaN).
	return equalOwnValues(nextValues, values) && equalOwnValues(message, nextMessage);
}

export const FormattedMessage = memo(NativeFormattedMessage, equalMessages);
