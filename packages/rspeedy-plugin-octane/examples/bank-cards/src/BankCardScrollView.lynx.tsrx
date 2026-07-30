/** @jsxImportSource @octanejs/lynx/intrinsics */
import { useState } from 'octane';

import { cards, checkIcon, getUrlByType, type BankCard } from './cards.ts';

export interface BankCardScrollViewProps {
	onCardSelect?: (card: BankCard) => void;
}

export function BankCardScrollView({ onCardSelect }: BankCardScrollViewProps) @{
	const [selectedCard, setSelectedCard] = useState(cards[0]);

	const handleCardSelect = (card: BankCard) => {
		setSelectedCard(card);
		onCardSelect?.(card);
	};

	<view class="payment-wrapper">
		<text class="payment-title">Payment method</text>
		<view class="payment-container">
			<scroll-view scroll-orientation="vertical" class="payment-sv">
				@for (const card of cards; key card.type) {
					<view class="payment-card" bindtap={() => handleCardSelect(card)}>
						<view class="payment-card-info">
							<image class="payment-card-icon" src={getUrlByType(card.type)} />
							<view class="payment-card-details">
								<text class="payment-card-name">{card.type.charAt(0).toUpperCase() +
									card.type.slice(1) as string}</text>
							</view>
						</view>
						@if (selectedCard === card) {
							<image class="payment-check-icon" src={checkIcon} />
						}
					</view>
				}
			</scroll-view>
		</view>
	</view>
}
