import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useGameStore } from '../hooks/useGameStore';
import { PARTNER_UPGRADE_ORDER, SHOWCASE_UPGRADE_ORDER } from '../utils/upgrades';
import { currentUserQueryOptions } from '~/hooks/useCurrentUser';

const UPGRADE_ORDER = [...PARTNER_UPGRADE_ORDER, ...SHOWCASE_UPGRADE_ORDER];

export function DebugPanel() {
	const [isCollapsed, setIsCollapsed] = useState(true);

	// Fetch user directly without route context dependency
	const userQuery = useQuery({
		...currentUserQueryOptions,
		staleTime: 30 * 1000,
	});

	const capabilities = userQuery.data?.capabilities || [];
	const canAccess = capabilities.some((cap: string) => ['admin', 'maintainer'].includes(cap));

	// Default to open for admins/maintainers once we know they have access
	useEffect(() => {
		if (canAccess) {
			// eslint-disable-next-line react-hooks/set-state-in-effect -- Auto-expand for admins
			setIsCollapsed(false);
		}
	}, [canAccess]);

	const {
		phase,
		stage,
		islands: _islands,
		expandedIslands,
		showcaseIslands,
		showcaseUnlocked,
		cornersUnlocked,
		cornerIslands: _cornerIslands,
		coins: _coins,
		discoveredIslands,
		coinsCollected: _coinsCollected,
		unlockedUpgrades: _unlockedUpgrades,
		shipStats: _shipStats,
		boatHealth: _boatHealth,
		showCollisionDebug,
		setShowCollisionDebug,
		debugZoomOut,
		setDebugZoomOut,
	} = useGameStore();

	if (!canAccess) return null;

	const discoverAllIslands = () => {
		const { islands, discoverIsland } = useGameStore.getState();
		// Discover all but don't trigger upgrade (skip last one)
		islands.slice(0, -1).forEach((island) => {
			discoverIsland(island.id);
		});
	};

	const discoverLastIsland = () => {
		const { islands, discoverIsland } = useGameStore.getState();
		const lastIsland = islands[islands.length - 1];
		if (lastIsland) {
			discoverIsland(lastIsland.id);
		}
	};

	const collectCoins = (count: number) => {
		const { coins, collectCoin } = useGameStore.getState();
		const uncollected = coins.filter((c) => !c.collected);
		uncollected.slice(0, count).forEach((coin) => {
			collectCoin(coin.id);
		});
	};

	const skipToPlaying = () => {
		useGameStore.setState({ phase: 'playing' });
	};

	const skipToBattle = () => {
		useGameStore.setState({
			phase: 'playing',
			stage: 'battle',
			boatType: 'ship',
			worldBoundary: 180,
		});
	};

	const discoverNextPartner = () => {
		const { expandedIslands, discoveredIslands, discoverIsland } = useGameStore.getState();
		const partnerIslands = expandedIslands.filter((i) => i.type === 'partner');
		const undiscovered = partnerIslands.find((i) => !discoveredIslands.has(i.id));
		if (undiscovered) {
			discoverIsland(undiscovered.id);
		}
	};

	const discoverAllPartners = () => {
		const { expandedIslands, discoverIsland } = useGameStore.getState();
		const partnerIslands = expandedIslands.filter((i) => i.type === 'partner');
		partnerIslands.forEach((island) => {
			discoverIsland(island.id);
		});
	};

	const discoverNextShowcase = () => {
		const { showcaseIslands, discoveredIslands, discoverIsland } = useGameStore.getState();
		const undiscovered = showcaseIslands.find((i) => !discoveredIslands.has(i.id));
		if (undiscovered) {
			discoverIsland(undiscovered.id);
		}
	};

	const discoverNextCorner = () => {
		const { cornerIslands, discoveredIslands, discoverIsland } = useGameStore.getState();
		const undiscovered = cornerIslands.find((i) => !discoveredIslands.has(i.id));
		if (undiscovered) {
			discoverIsland(undiscovered.id);
		}
	};

	const discoverAllCorners = () => {
		const { cornerIslands, discoverIsland } = useGameStore.getState();
		cornerIslands.forEach((island) => {
			discoverIsland(island.id);
		});
	};

	const grantNextUpgrade = () => {
		const { unlockedUpgrades, applyShipUpgrade } = useGameStore.getState();
		const nextUpgrade = UPGRADE_ORDER[unlockedUpgrades.length];
		if (nextUpgrade) {
			applyShipUpgrade(nextUpgrade);
			useGameStore.setState({ lastUnlockedUpgrade: nextUpgrade });
		}
	};

	const grantAllUpgrades = () => {
		const { applyShipUpgrade } = useGameStore.getState();
		UPGRADE_ORDER.forEach((upgrade) => {
			applyShipUpgrade(upgrade);
		});
	};

	const takeDamage = (amount: number) => {
		const { boatHealth, setBoatHealth } = useGameStore.getState();
		setBoatHealth(Math.max(0, boatHealth - amount));
	};

	const healFull = () => {
		const { shipStats, setBoatHealth } = useGameStore.getState();
		setBoatHealth(shipStats.maxHealth);
	};

	if (phase === 'intro') {
		return (
			<div className="absolute top-1/2 -translate-y-1/2 left-4 z-50">
				<button
					onClick={() => setIsCollapsed(!isCollapsed)}
					className="bg-black/80 text-yellow-400 font-bold px-3 py-1.5 rounded-lg text-xs font-mono hover:bg-black/90 transition-colors"
				>
					{isCollapsed ? '🔧' : '✕'} DEBUG
				</button>
				{!isCollapsed && (
					<div className="mt-1 bg-black/80 text-white p-3 rounded-lg text-xs font-mono space-y-2">
						<button
							onClick={skipToPlaying}
							className="block w-full px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded"
						>
							Skip Intro
						</button>
					</div>
				)}
			</div>
		);
	}

	const partnerIslands = expandedIslands.filter((i) => i.type === 'partner');
	const _discoveredPartners = partnerIslands.filter((i) => discoveredIslands.has(i.id)).length;
	const _discoveredShowcases = showcaseIslands.filter((i) => discoveredIslands.has(i.id)).length;

	return (
		<div className="absolute top-1/2 -translate-y-1/2 left-4 z-50">
			<button
				onClick={() => setIsCollapsed(!isCollapsed)}
				className="bg-black/80 text-yellow-400 font-bold px-3 py-1.5 rounded-lg text-xs font-mono hover:bg-black/90 transition-colors"
			>
				{isCollapsed ? '🔧' : '✕'} DEBUG
			</button>
			{!isCollapsed && (
				<div className="mt-1 bg-black/80 text-white p-3 rounded-lg text-xs font-mono space-y-1 max-w-52">
					{stage === 'exploration' && (
						<>
							<button
								onClick={discoverAllIslands}
								className="block w-full px-2 py-1 bg-green-600 hover:bg-green-500 rounded"
							>
								Discover All (except last)
							</button>
							<button
								onClick={discoverLastIsland}
								className="block w-full px-2 py-1 bg-orange-600 hover:bg-orange-500 rounded"
							>
								Discover Last (trigger upgrade)
							</button>
							<button
								onClick={skipToBattle}
								className="block w-full px-2 py-1 bg-purple-600 hover:bg-purple-500 rounded"
							>
								Skip to Battle Stage
							</button>
						</>
					)}

					{stage === 'battle' && (
						<>
							<button
								onClick={discoverNextPartner}
								className="block w-full px-2 py-1 bg-green-600 hover:bg-green-500 rounded"
							>
								Discover Next Partner
							</button>
							<button
								onClick={discoverAllPartners}
								className="block w-full px-2 py-1 bg-amber-600 hover:bg-amber-500 rounded"
							>
								Discover All Partners
							</button>
							{showcaseUnlocked && (
								<button
									onClick={discoverNextShowcase}
									className="block w-full px-2 py-1 bg-purple-600 hover:bg-purple-500 rounded"
								>
									Discover Next Showcase
								</button>
							)}
							{cornersUnlocked && (
								<>
									<button
										onClick={discoverNextCorner}
										className="block w-full px-2 py-1 bg-rose-600 hover:bg-rose-500 rounded"
									>
										Discover Next Corner
									</button>
									<button
										onClick={discoverAllCorners}
										className="block w-full px-2 py-1 bg-rose-700 hover:bg-rose-600 rounded"
									>
										Discover All Corners
									</button>
								</>
							)}
							<button
								onClick={grantNextUpgrade}
								className="block w-full px-2 py-1 bg-cyan-600 hover:bg-cyan-500 rounded"
							>
								Grant Next Upgrade
							</button>
							<button
								onClick={grantAllUpgrades}
								className="block w-full px-2 py-1 bg-cyan-700 hover:bg-cyan-600 rounded"
							>
								Grant All Upgrades
							</button>
							<button
								onClick={() => takeDamage(25)}
								className="block w-full px-2 py-1 bg-red-600 hover:bg-red-500 rounded"
							>
								Take 25 Damage
							</button>
							<button
								onClick={healFull}
								className="block w-full px-2 py-1 bg-pink-600 hover:bg-pink-500 rounded"
							>
								Heal to Full
							</button>
							<button
								onClick={() => takeDamage(999)}
								className="block w-full px-2 py-1 bg-red-800 hover:bg-red-700 rounded"
							>
								Kill Player
							</button>
						</>
					)}

					<button
						onClick={() => collectCoins(10)}
						className="block w-full px-2 py-1 bg-yellow-600 hover:bg-yellow-500 rounded"
					>
						Collect 10 Coins
					</button>
					<button
						onClick={() => collectCoins(50)}
						className="block w-full px-2 py-1 bg-yellow-600 hover:bg-yellow-500 rounded"
					>
						Collect All Coins
					</button>

					<button
						onClick={() => useGameStore.getState().reset()}
						className="block w-full px-2 py-1 bg-red-600 hover:bg-red-500 rounded"
					>
						Reset Game
					</button>

					<label className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-600 cursor-pointer">
						<input
							type="checkbox"
							checked={debugZoomOut}
							onChange={(e) => setDebugZoomOut(e.target.checked)}
							className="rounded"
						/>
						<span>Zoom Out (Full Map)</span>
					</label>

					<label className="flex items-center gap-2 cursor-pointer">
						<input
							type="checkbox"
							checked={showCollisionDebug}
							onChange={(e) => setShowCollisionDebug(e.target.checked)}
							className="rounded"
						/>
						<span>Show Collision Bounds</span>
					</label>
				</div>
			)}
		</div>
	);
}
