import { useGameStore } from '../../hooks/useGameStore';
import type { Cannonballs } from '../entities/Cannonballs';

const GRAVITY = -15;
const MAX_LIFETIME = 3000;
const HIT_RADIUS = 1.5;

export class CannonballSystem {
	update(delta: number, cannonballsEntity: Cannonballs): void {
		const state = useGameStore.getState();
		const {
			cannonballs,
			updateCannonballs,
			otherPlayers,
			setOtherPlayers,
			boatPosition,
			boatHealth,
			setPhase,
		} = state;

		const now = Date.now();
		const dt = Math.min(delta, 0.1);
		const updatedBalls = [];
		const hitsToProcess: Array<{ ballId: number; playerId: string }> = [];

		for (const ball of cannonballs) {
			if (now - ball.createdAt > MAX_LIFETIME) {
				continue;
			}

			const newX = ball.position[0] + ball.velocity[0] * dt;
			const newY = ball.position[1] + ball.velocity[1] * dt;
			const newZ = ball.position[2] + ball.velocity[2] * dt;
			const newVelY = ball.velocity[1] + GRAVITY * dt;

			if (newY <= 0) {
				cannonballsEntity.addSplash([newX, 0.1, newZ]);
				continue;
			}

			if (ball.ownerId === 'player') {
				for (const player of otherPlayers) {
					const dx = newX - player.position[0];
					const dz = newZ - player.position[2];
					const dist = Math.sqrt(dx * dx + dz * dz);

					if (dist < HIT_RADIUS && newY < 2) {
						hitsToProcess.push({ ballId: ball.id, playerId: player.id });
						cannonballsEntity.addSplash([newX, 0.5, newZ]);
						break;
					}
				}
			}

			if (ball.ownerId !== 'player') {
				const dx = newX - boatPosition[0];
				const dz = newZ - boatPosition[2];
				const dist = Math.sqrt(dx * dx + dz * dz);

				if (dist < HIT_RADIUS && newY < 2) {
					hitsToProcess.push({ ballId: ball.id, playerId: 'player' });
					cannonballsEntity.addSplash([newX, 0.5, newZ]);
				}
			}

			if (hitsToProcess.some((h) => h.ballId === ball.id)) {
				continue;
			}

			updatedBalls.push({
				...ball,
				position: [newX, newY, newZ] as [number, number, number],
				velocity: [ball.velocity[0], newVelY, ball.velocity[2]] as [number, number, number],
			});
		}

		if (hitsToProcess.length > 0) {
			const playerHit = hitsToProcess.find((h) => h.playerId === 'player');
			if (playerHit) {
				const newHealth = Math.max(0, boatHealth - 20);
				useGameStore.setState({ boatHealth: newHealth });

				if (newHealth <= 0) {
					setPhase('gameover');
				}
			}

			const updatedPlayers = otherPlayers.map((player) => {
				const hit = hitsToProcess.find((h) => h.playerId === player.id);
				if (hit) {
					const newHealth = player.health - 25;
					return { ...player, health: Math.max(0, newHealth) };
				}
				return player;
			});

			// Count kills (ships that dropped to 0 health)
			const killedCount = updatedPlayers.filter((p) => p.health <= 0).length;
			if (killedCount > 0) {
				const { addKill } = useGameStore.getState();
				for (let i = 0; i < killedCount; i++) {
					addKill();
				}
			}

			setOtherPlayers(updatedPlayers.filter((p) => p.health > 0));
		}

		updateCannonballs(updatedBalls);
	}
}
