import { createElement } from 'octane';
import type { IconComponent, SanityIconProps } from './types';

export function createSanityIcon(
	displayName: string,
	attributes: Record<string, string>,
	body: string,
): IconComponent {
	const Component = function SanityIcon(props: SanityIconProps = {}) {
		const {
			children: _children,
			dangerouslySetInnerHTML: _dangerouslySetInnerHTML,
			ref,
			...rest
		} = props;
		return createElement('svg', {
			...attributes,
			...rest,
			ref,
			dangerouslySetInnerHTML: { __html: body },
		});
	};
	Component.displayName = displayName;
	return Component;
}
