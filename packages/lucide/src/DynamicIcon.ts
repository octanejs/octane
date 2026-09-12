import { createElement, useEffect, useState } from 'octane';
import Icon from './Icon';
import dynamicIconImports, { type IconName } from './dynamicIconImports';
import type { LucideIconData, LucideProps } from './types';

const STATE_SLOT = Symbol.for('@octanejs/lucide:DynamicIcon:iconNode');
const EFFECT_SLOT = Symbol.for('@octanejs/lucide:DynamicIcon:load');

export interface DynamicIconProps extends LucideProps {
	name: IconName;
	fallback?: ((props: Record<string, never>) => unknown) | null;
}

export const iconNames = Object.keys(dynamicIconImports) as IconName[];

async function getIconData(name: IconName): Promise<LucideIconData> {
	if (!Object.hasOwn(dynamicIconImports, name)) {
		throw new Error('[lucide-react]: Name in Lucide DynamicIcon not found');
	}
	const icon = await dynamicIconImports[name]();
	return icon.__iconData;
}

export function DynamicIcon({ name, fallback: Fallback, ...props }: DynamicIconProps) {
	const [iconData, setIconData] = useState<LucideIconData | undefined>(undefined, STATE_SLOT);

	useEffect(
		() => {
			let active = true;
			getIconData(name)
				.then((data) => {
					if (active) setIconData(data);
				})
				.catch((error) => {
					if (active) console.error(error);
				});
			return () => {
				active = false;
			};
		},
		[name],
		EFFECT_SLOT,
	);

	if (iconData == null) {
		return Fallback == null ? null : createElement(Fallback as any, {});
	}

	return createElement(Icon, { ...props, icon: iconData });
}

export default DynamicIcon;
