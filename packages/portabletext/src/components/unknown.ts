import type { PortableTextBlock, PortableTextListItemBlock } from '@portabletext/types';
import { createElement } from 'octane';
import type {
	OctanePortableTextList,
	PortableTextComponentProps,
	PortableTextMarkComponentProps,
	UnknownNodeType,
} from '../types';
import { unknownTypeWarning } from '../warnings';

const hidden = { display: 'none' };

export function DefaultUnknownType({
	value,
	isInline,
}: PortableTextComponentProps<UnknownNodeType>) {
	const warning = unknownTypeWarning(value._type);
	return isInline
		? createElement('span', { style: hidden, children: warning })
		: createElement('div', { style: hidden, children: warning });
}

export function DefaultUnknownMark({ markType, children }: PortableTextMarkComponentProps) {
	return createElement('span', { className: `unknown__pt__mark__${markType}`, children });
}

export function DefaultUnknownBlockStyle({
	children,
}: PortableTextComponentProps<PortableTextBlock>) {
	return createElement('p', { children });
}

export function DefaultUnknownList({
	children,
}: PortableTextComponentProps<OctanePortableTextList>) {
	return createElement('ul', { children });
}

export function DefaultUnknownListItem({
	children,
}: PortableTextComponentProps<PortableTextListItemBlock>) {
	return createElement('li', { children });
}
