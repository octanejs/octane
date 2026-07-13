import { createElement, useEffect, useState } from 'octane';
import Icon from './Icon';
import dynamicIconImports, { type IconName } from './dynamicIconImports';
import type { IconNode, LucideProps } from './types';

const STATE_SLOT = Symbol.for('@octanejs/lucide:DynamicIcon:iconNode');
const EFFECT_SLOT = Symbol.for('@octanejs/lucide:DynamicIcon:load');

export interface DynamicIconProps extends LucideProps {
	name: IconName;
	fallback?: ((props: Record<string, never>) => unknown) | null;
}

export const iconNames = Object.keys(dynamicIconImports) as IconName[];

async function getIconNode(name: IconName): Promise<IconNode> {
	if (!(name in dynamicIconImports)) {
		throw new Error('[lucide-react]: Name in Lucide DynamicIcon not found');
	}
	const icon = await dynamicIconImports[name]();
	return icon.__iconNode;
}

export function DynamicIcon({ name, fallback: Fallback, ...props }: DynamicIconProps) {
	const [iconNode, setIconNode] = useState<IconNode | undefined>(undefined, STATE_SLOT);

	useEffect(
		() => {
			getIconNode(name)
				.then(setIconNode)
				.catch((error) => {
					console.error(error);
				});
		},
		[name],
		EFFECT_SLOT,
	);

	if (iconNode == null) {
		return Fallback == null ? null : createElement(Fallback as any, {});
	}

	return createElement(Icon, { ...props, iconNode });
}

export default DynamicIcon;
