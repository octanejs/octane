import * as React from 'octane';
import { Avatar } from '@octanejs/base-ui/avatar';

export function AvatarImageServerCase1({
	TRANSPARENT_IMAGE_DATA_URI,
}: {
	TRANSPARENT_IMAGE_DATA_URI: string;
}) {
	return <Avatar.Root>
		<Avatar.Image data-testid="image" keepMounted src={TRANSPARENT_IMAGE_DATA_URI} alt="Jane Doe" />
		<Avatar.Fallback>JD</Avatar.Fallback>
	</Avatar.Root>;
}

export function AvatarImageServerCase2({
	TRANSPARENT_IMAGE_DATA_URI,
}: {
	TRANSPARENT_IMAGE_DATA_URI: string;
}) {
	return <Avatar.Root>
		<Avatar.Image data-testid="image" keepMounted src={TRANSPARENT_IMAGE_DATA_URI} alt="" />
		<Avatar.Fallback>JD</Avatar.Fallback>
	</Avatar.Root>;
}

export function AvatarImageServerCase3({ DATA_URI }: { DATA_URI: string }) {
	return <Avatar.Root>
		<Avatar.Image src={DATA_URI} alt="Jane Doe" />
		<Avatar.Fallback>JD</Avatar.Fallback>
	</Avatar.Root>;
}
