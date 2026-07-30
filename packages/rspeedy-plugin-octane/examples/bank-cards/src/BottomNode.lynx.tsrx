/** @jsxImportSource @octanejs/lynx/intrinsics */
export function BottomNode({ onPayNow }: { onPayNow?: () => void }) @{
	<view class="bottom-node">
		<view class="bottom-continue-button" bindtap={onPayNow}>
			<text class="bottom-continue-text">Pay Now</text>
		</view>
	</view>
}
