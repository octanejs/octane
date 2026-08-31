import type { PortableTextBlock } from '@portabletext/types';
import { createElement } from 'octane';
import type {
	DefaultPortableTextBlockStyle,
	PortableTextBlockComponent,
	PortableTextComponentProps,
	PortableTextOctaneComponents,
} from '../types';
import { DefaultListItem, defaultLists } from './list';
import { defaultMarks } from './marks';
import {
	DefaultUnknownBlockStyle,
	DefaultUnknownList,
	DefaultUnknownListItem,
	DefaultUnknownMark,
	DefaultUnknownType,
} from './unknown';

export function DefaultHardBreak() {
	return createElement('br', {});
}
function DefaultNormal({ children }: PortableTextComponentProps<PortableTextBlock>) {
	return createElement('p', { children });
}
function DefaultBlockquote({ children }: PortableTextComponentProps<PortableTextBlock>) {
	return createElement('blockquote', { children });
}
function DefaultH1({ children }: PortableTextComponentProps<PortableTextBlock>) {
	return createElement('h1', { children });
}
function DefaultH2({ children }: PortableTextComponentProps<PortableTextBlock>) {
	return createElement('h2', { children });
}
function DefaultH3({ children }: PortableTextComponentProps<PortableTextBlock>) {
	return createElement('h3', { children });
}
function DefaultH4({ children }: PortableTextComponentProps<PortableTextBlock>) {
	return createElement('h4', { children });
}
function DefaultH5({ children }: PortableTextComponentProps<PortableTextBlock>) {
	return createElement('h5', { children });
}
function DefaultH6({ children }: PortableTextComponentProps<PortableTextBlock>) {
	return createElement('h6', { children });
}

export const defaultBlockStyles: Record<DefaultPortableTextBlockStyle, PortableTextBlockComponent> =
	{
		normal: DefaultNormal,
		blockquote: DefaultBlockquote,
		h1: DefaultH1,
		h2: DefaultH2,
		h3: DefaultH3,
		h4: DefaultH4,
		h5: DefaultH5,
		h6: DefaultH6,
	};

export const defaultComponents: PortableTextOctaneComponents = {
	types: {},
	block: defaultBlockStyles,
	marks: defaultMarks,
	list: defaultLists,
	listItem: DefaultListItem,
	hardBreak: DefaultHardBreak,
	unknownType: DefaultUnknownType,
	unknownMark: DefaultUnknownMark,
	unknownList: DefaultUnknownList,
	unknownListItem: DefaultUnknownListItem,
	unknownBlockStyle: DefaultUnknownBlockStyle,
};
