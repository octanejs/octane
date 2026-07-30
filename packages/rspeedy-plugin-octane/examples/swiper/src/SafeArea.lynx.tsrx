/** @jsxImportSource @octanejs/lynx/intrinsics */
import type { JSX } from '@octanejs/lynx/intrinsics';

export function SafeArea({ children }: { children?: JSX.Element }) @{
	const isIOS = SystemInfo.platform === 'iOS';
	<view class={['safe-area', isIOS ? 'ios' : 'android']}>{children}</view>
}
