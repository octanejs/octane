import type { PortableTextListItemBlock } from '@portabletext/types';
import { createElement } from 'octane';
import type {
	DefaultPortableTextListItem,
	OctanePortableTextList,
	PortableTextComponentProps,
	PortableTextListComponent,
} from '../types';

function DefaultNumberList({ children }: PortableTextComponentProps<OctanePortableTextList>) {
	return createElement('ol', { children });
}

function DefaultBulletList({ children }: PortableTextComponentProps<OctanePortableTextList>) {
	return createElement('ul', { children });
}

export function DefaultListItem({
	children,
}: PortableTextComponentProps<PortableTextListItemBlock>) {
	return createElement('li', { children });
}

export const defaultLists: Record<DefaultPortableTextListItem, PortableTextListComponent> = {
	number: DefaultNumberList,
	bullet: DefaultBulletList,
};
