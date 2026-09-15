import { createElement } from 'octane';
import Icon from './Icon';
import { toPascalCase } from './shared';
import type { IconNode, LucideIcon, LucideIconData, LucideProps } from './types';

export function createLucideIcon(icon: LucideIconData): LucideIcon;
export function createLucideIcon(name: string, node: IconNode, aliases?: string[]): LucideIcon;
export function createLucideIcon(
	icon: LucideIconData | string,
	node: IconNode = [],
	aliases: string[] = [],
): LucideIcon {
	const data: LucideIconData = typeof icon === 'string' ? { name: icon, node, aliases } : icon;
	const Component = (props: LucideProps) => createElement(Icon, { ...props, icon: data });
	Component.displayName = data.name ? toPascalCase(data.name) : 'Icon';
	return Component;
}

export default createLucideIcon;
