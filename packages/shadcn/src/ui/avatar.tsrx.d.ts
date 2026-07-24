type Props = { className?: string } & Record<string, unknown>;

export interface AvatarProps extends Record<string, unknown> {
	className?: string;
	size?: 'default' | 'sm' | 'lg';
}

export function Avatar(props: AvatarProps): any;
export function AvatarImage(props: Props): any;
export function AvatarFallback(props: Props): any;
export function AvatarBadge(props: Props): any;
export function AvatarGroup(props: Props): any;
export function AvatarGroupCount(props: Props): any;
