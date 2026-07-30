/** @jsxImportSource @octanejs/lynx/intrinsics */
import { LikeIcon } from './LikeIcon.lynx.tsrx';
import type { Picture } from './pictures/furnituresPictures.ts';

export function LikeImageCard({ picture }: { picture: Picture }) @{
	<view class="picture-wrapper">
		<image
			style={{ width: '100%', aspectRatio: picture.width / picture.height }}
			src={picture.src}
		/>
		<LikeIcon />
	</view>
}
