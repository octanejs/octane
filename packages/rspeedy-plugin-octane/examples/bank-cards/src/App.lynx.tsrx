/** @jsxImportSource @octanejs/lynx/intrinsics */
import { useState } from 'octane';

import { Amount } from './Amount.lynx.tsrx';
import { BankCardScrollView } from './BankCardScrollView.lynx.tsrx';
import { BottomNode } from './BottomNode.lynx.tsrx';
import { Card } from './Card.lynx.tsrx';
import type { BankCard } from './cards.ts';

export function App() @{
	const [selectedCard, setSelectedCard] = useState<BankCard>({
		type: 'visa',
		number: '4558 **** **** 6767',
		name: 'Alex Quentin',
	});

	const [isFront, setIsFront] = useState(true);
	const [isFirstRender, setIsFirstRender] = useState(true);

	const handleCardSelect = (card: BankCard) => {
		setSelectedCard(card);
		setIsFront(true);
	};

	const handlePayNow = () => {
		if (isFirstRender) {
			setIsFirstRender(false);
		}
		setIsFront(!isFront);
	};

	<view class="page">
		<Amount amount="1314" />
		<Card selectedCard={selectedCard} isFront={isFront} isFirstRender={isFirstRender} />
		<BankCardScrollView onCardSelect={handleCardSelect} />
		<BottomNode onPayNow={handlePayNow} />
	</view>
}
