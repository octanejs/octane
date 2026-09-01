import type { TypedObject } from '@portabletext/types';
import { createElement } from 'octane';
import type {
	DefaultPortableTextMark,
	PortableTextMarkComponent,
	PortableTextMarkComponentProps,
} from '../types';

interface DefaultLinkMark extends TypedObject {
	_type: 'link';
	href: string;
}

const underlineStyle = { textDecoration: 'underline' };

function DefaultEm({ children }: PortableTextMarkComponentProps) {
	return createElement('em', { children });
}
function DefaultStrong({ children }: PortableTextMarkComponentProps) {
	return createElement('strong', { children });
}
function DefaultCode({ children }: PortableTextMarkComponentProps) {
	return createElement('code', { children });
}
function DefaultUnderline({ children }: PortableTextMarkComponentProps) {
	return createElement('span', { style: underlineStyle, children });
}
function DefaultStrikeThrough({ children }: PortableTextMarkComponentProps) {
	return createElement('del', { children });
}
function DefaultLink({ children, value }: PortableTextMarkComponentProps<DefaultLinkMark>) {
	return createElement('a', { href: value?.href, children });
}

export const defaultMarks: Record<DefaultPortableTextMark, PortableTextMarkComponent> = {
	em: DefaultEm,
	strong: DefaultStrong,
	code: DefaultCode,
	underline: DefaultUnderline,
	'strike-through': DefaultStrikeThrough,
	link: DefaultLink,
};
