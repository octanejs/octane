import { useGameStore } from '../../hooks/useGameStore';
import type { Coins } from '../entities/Coins';

const COIN_COLLECT_RADIUS = 1.5;

export class CoinSystem {
	update(_delta: number, _coinsEntity: Coins): void {
		const { boatPosition, coins, collectCoin } = useGameStore.getState();

		for (const coin of coins) {
			if (coin.collected) continue;

			const dx = boatPosition[0] - coin.position[0];
			const dz = boatPosition[2] - coin.position[2];
			const dist = Math.sqrt(dx * dx + dz * dz);

			if (dist < COIN_COLLECT_RADIUS) {
				collectCoin(coin.id);
			}
		}
	}
}
