/** @jsxImportSource @octanejs/lynx/intrinsics */
export function Indicator({
	total,
	current,
	onItemClick,
}: {
	total: number;
	current: number;
	onItemClick?: (index: number) => void;
}) @{
	const indexes: number[] = [];
	for (let index = 0; index < total; index++) indexes.push(index);
	<view class="indicator">
		@for (const index of indexes; key index) {
			<IndicatorItem active={index === current} onClick={onItemClick} index={index} />
		}
	</view>
}

function IndicatorItem({
	active,
	onClick,
	index,
}: {
	active: boolean;
	onClick?: (index: number) => void;
	index: number;
}) @{
	<view class={['indicator-item', active ? 'active' : '']} bindtap={() => onClick?.(index)} />
}
