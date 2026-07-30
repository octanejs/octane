/** @jsxImportSource @octanejs/lynx/intrinsics */
import type { BankCard } from './cards.ts';

interface CardProps {
	selectedCard: BankCard;
	isFront: boolean;
	isFirstRender: boolean;
}

export function Card({ selectedCard, isFront, isFirstRender }: CardProps) @{
	const parts = selectedCard.number.split(' ');
	const firstFour = parts[0] ?? '4558';
	const lastFour = parts[3] ?? '6767';

	<view class="card-content">
		<view class={['card-back', !isFirstRender ? (isFront ? 'back' : 'front') : '']}>
			<view class="card-back">
				<view class="card-inputs">
					<view class="input-group">
						<text class="input-label">Card Holder</text>
						<view class="input-field">
							<text>Alex Quentin</text>
						</view>
					</view>
					<view class="input-group input-ccv">
						<view class="input-label-wrapper">
							<text class="input-label">CCV2</text>
						</view>
						<view class="input-field-small" />
					</view>
				</view>
			</view>
		</view>

		<view class={['card-front', !isFirstRender ? (isFront ? 'front' : 'back') : '']}>
			<view class="card-number">
				<text class="first-digits">{firstFour}</text>
				<text class="middle-digits">**** ****</text>
				<text class="last-digits">{lastFour}</text>
			</view>
			<view class="card-info">
				<text>{selectedCard.name || 'Card holder'}</text>
			</view>
		</view>
	</view>
}
