/** @jsxImportSource @octanejs/lynx/intrinsics */
export function Amount({ amount }: { amount: string }) @{
	<view class="amount-wrapper">
		<text class="amount-label">Amount paid</text>
		<view class="amount-value">
			<text class="amount-currency">¥</text>
			<text class="amount-number">{amount}</text>
		</view>
	</view>
}
