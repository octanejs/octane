/** @jsxImportSource @octanejs/lynx/intrinsics */
import { useState } from 'octane';

import redHeart from './pictures/redHeart.png';
import whiteHeart from './pictures/whiteHeart.png';

export function LikeIcon() @{
	const [isLiked, setIsLiked] = useState(false);
	<view class="like-icon" bindtap={() => setIsLiked(true)}>
		@if (isLiked) {
			<view class="circle" />
		}
		@if (isLiked) {
			<view class="circle circleAfter" />
		}
		<image src={isLiked ? redHeart : whiteHeart} class="heart-love" />
	</view>
}
