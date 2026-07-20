/* eslint-disable react-hooks/set-state-in-effect -- game animation state sync */
import { useEffect, useState } from 'react';
import { useGameStore } from '../hooks/useGameStore';
import { Map, Coins, ShoppingBag, Zap } from 'lucide-react';

export function GameHUD() {
	const {
		phase,
		stage,
		discoveredIslands,
		islands,
		expandedIslands,
		showcaseIslands,
		cornerIslands,
		showcaseUnlocked,
		cornersUnlocked,

		coinsCollected,
		boatHealth,
		shipStats,
		purchasedBoosts,
		lastFireTime,
		lastUnlockedUpgrade,
		clearLastUnlockedUpgrade,
		openShop,
		setPhase,
		fireCannon,
	} = useGameStore();

	// Calculate total max health including purchased boosts
	const totalMaxHealth = shipStats.maxHealth + purchasedBoosts.permHealth * 25;

	// Cooldown progress (0-1, 1 = ready)
	const [cooldownProgress, setCooldownProgress] = useState(1);
	const [showUpgradeNotification, setShowUpgradeNotification] = useState(false);
	const [showCoinHint, setShowCoinHint] = useState(false);
	const [coinHintDismissed, setCoinHintDismissed] = useState(false);
	const [showShowcaseUnlock, setShowShowcaseUnlock] = useState(false);
	// Don't re-show notification if it was already unlocked before this session
	const [showcaseUnlockShown, setShowcaseUnlockShown] = useState(showcaseUnlocked);
	const [showCornersUnlock, setShowCornersUnlock] = useState(false);
	const [cornersUnlockShown, setCornersUnlockShown] = useState(cornersUnlocked);
	const [damageFlash, setDamageFlash] = useState(false);
	const [prevHealth, setPrevHealth] = useState(boatHealth);

	// Update cooldown progress
	useEffect(() => {
		if (stage !== 'battle') return;
		const interval = setInterval(() => {
			const now = Date.now();
			const elapsed = now - lastFireTime;
			const progress = Math.min(1, elapsed / shipStats.sideFireRate);
			setCooldownProgress(progress);
		}, 50);
		return () => clearInterval(interval);
	}, [stage, lastFireTime, shipStats.sideFireRate]);

	// Show upgrade notification when new upgrade unlocked
	useEffect(() => {
		if (lastUnlockedUpgrade) {
			setShowUpgradeNotification(true);
			const timer = setTimeout(() => {
				setShowUpgradeNotification(false);
				clearLastUnlockedUpgrade();
			}, 3000);
			return () => clearTimeout(timer);
		}
	}, [lastUnlockedUpgrade, clearLastUnlockedUpgrade]);

	// Show coin hint on first coin collected
	useEffect(() => {
		if (coinsCollected === 1 && !coinHintDismissed) {
			setShowCoinHint(true);
			const timer = setTimeout(() => {
				setShowCoinHint(false);
				setCoinHintDismissed(true);
			}, 5000);
			return () => clearTimeout(timer);
		}
	}, [coinsCollected, coinHintDismissed]);

	// Check for game over when health drops to 0
	useEffect(() => {
		if (stage === 'battle' && phase === 'playing' && boatHealth <= 0) {
			setPhase('gameover');
		}
	}, [stage, phase, boatHealth, setPhase]);

	// Show showcase unlock notification
	useEffect(() => {
		if (showcaseUnlocked && !showcaseUnlockShown) {
			setShowShowcaseUnlock(true);
			setShowcaseUnlockShown(true);
		}
	}, [showcaseUnlocked, showcaseUnlockShown]);

	// Show corners unlock notification
	useEffect(() => {
		if (cornersUnlocked && !cornersUnlockShown) {
			setShowCornersUnlock(true);
			setCornersUnlockShown(true);
		}
	}, [cornersUnlocked, cornersUnlockShown]);

	// Flash health bar when taking damage
	useEffect(() => {
		if (boatHealth < prevHealth) {
			setDamageFlash(true);
			const timer = setTimeout(() => setDamageFlash(false), 150);
			return () => clearTimeout(timer);
		}
		setPrevHealth(boatHealth);
	}, [boatHealth, prevHealth]);

	// Total islands depends on stage (includes showcase + corner islands when unlocked)
	const totalIslands =
		stage === 'battle'
			? islands.length + expandedIslands.length + showcaseIslands.length + cornerIslands.length
			: islands.length;

	if (phase !== 'playing') return null;

	// lastUnlockedUpgrade is now the full Upgrade object
	const upgradeInfo = lastUnlockedUpgrade;

	return (
		<div className="absolute inset-0 z-10 pointer-events-none">
			{/* Coin hint */}
			{showCoinHint && (
				<div className="absolute top-16 left-1/2 -translate-x-1/2 animate-in fade-in slide-in-from-top-2 duration-300">
					<div className="bg-black/60 backdrop-blur-sm rounded-xl px-4 py-2 text-center text-white text-sm max-w-xs relative">
						<button
							onClick={() => {
								setShowCoinHint(false);
								setCoinHintDismissed(true);
							}}
							className="absolute -top-1 -right-1 w-5 h-5 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white/60 hover:text-white transition-colors pointer-events-auto"
						>
							×
						</button>
						<span className="text-yellow-400 font-medium">Coins</span> make you faster and can be
						spent in the <span className="text-yellow-400 font-medium">shop</span>!
					</div>
				</div>
			)}

			{/* Top bar */}
			<div className="flex justify-end items-start p-4">
				{/* Coin counter + Shop button */}
				<button
					onClick={openShop}
					className="pointer-events-auto bg-black/30 backdrop-blur-sm rounded-xl px-4 py-2 flex items-center gap-2 text-white hover:bg-black/40 transition-colors"
				>
					<Coins className="w-5 h-5 text-yellow-400" />
					<span className="font-bold text-yellow-400">{coinsCollected}</span>
					<ShoppingBag className="w-4 h-4 ml-1 text-white/60" />
				</button>

				{/* Island counter */}
				<div className="pointer-events-auto bg-black/30 backdrop-blur-sm rounded-xl px-4 py-2 flex items-center gap-2 text-white ml-2">
					<Map className="w-5 h-5" />
					<span className="font-bold">
						{discoveredIslands.size} / {totalIslands}
					</span>
					<span className="text-white/60 text-sm hidden sm:inline">islands</span>
				</div>
			</div>

			{/* Bottom bar - Battle stage only */}
			{stage === 'battle' && (
				<div
					className={`absolute bottom-4 flex flex-col items-center gap-2 ${'max-md:right-4 max-md:left-auto max-md:translate-x-0 left-1/2 -translate-x-1/2'}`}
				>
					{/* Touch fire button - only visible on touch devices */}
					<button
						onClick={fireCannon}
						className="md:hidden pointer-events-auto bg-red-500/80 backdrop-blur-sm rounded-full p-4 flex items-center justify-center text-white hover:bg-red-600/80 active:scale-95 transition-all shadow-lg"
						aria-label="Fire cannons"
					>
						<Zap className="w-6 h-6" />
					</button>
					{/* Health bar */}
					<div
						className={`backdrop-blur-sm rounded-full px-4 py-2 flex items-center gap-3 transition-colors duration-75 ${
							damageFlash ? 'bg-red-500/70' : 'bg-black/40'
						} max-md:px-3 max-md:py-1.5`}
					>
						<span className="text-red-400 text-sm font-medium max-md:text-xs">HP</span>
						<div className="w-32 h-3 bg-black/50 rounded-full overflow-hidden max-md:w-20 max-md:h-2">
							<div
								className="h-full bg-linear-to-r from-red-600 to-red-400"
								style={{
									width: `${(boatHealth / totalMaxHealth) * 100}%`,
								}}
							/>
						</div>
						<span className="text-white text-sm font-mono w-12 max-md:text-xs max-md:w-10">
							{Math.round(boatHealth)}/{totalMaxHealth}
						</span>
					</div>

					{/* Cooldown gauge */}
					<div className="bg-black/40 backdrop-blur-sm rounded-full px-4 py-2 flex items-center gap-3 max-md:px-3 max-md:py-1.5">
						<span className="text-cyan-400 text-sm font-medium max-md:text-xs">CANNON</span>
						<div className="w-24 h-2 bg-black/50 rounded-full overflow-hidden max-md:w-16 max-md:h-1.5">
							<div
								className={`h-full transition-all duration-75 ${
									cooldownProgress >= 1
										? 'bg-linear-to-r from-cyan-500 to-cyan-300'
										: 'bg-linear-to-r from-cyan-800 to-cyan-600'
								}`}
								style={{ width: `${cooldownProgress * 100}%` }}
							/>
						</div>
						<span className="text-white/60 text-xs w-12 max-md:text-[10px] max-md:w-10">
							{cooldownProgress >= 1 ? 'READY' : 'LOADING'}
						</span>
					</div>
				</div>
			)}

			{/* Upgrade notification */}
			{showUpgradeNotification && upgradeInfo && (
				<div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-in fade-in zoom-in duration-300">
					<div className="bg-linear-to-br from-yellow-500/90 to-amber-600/90 backdrop-blur-md rounded-2xl px-8 py-5 text-center shadow-2xl border border-yellow-300/30">
						<div className="text-4xl mb-2">{upgradeInfo.icon}</div>
						<div className="text-white font-bold text-xl mb-1">{upgradeInfo.name}</div>
						<div className="text-yellow-100/80 text-sm">{upgradeInfo.description}</div>
					</div>
				</div>
			)}

			{/* Showcase unlock notification */}
			{showShowcaseUnlock && (
				<div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-in fade-in zoom-in duration-300">
					<div className="bg-linear-to-br from-purple-500/90 to-violet-600/90 backdrop-blur-md rounded-2xl px-8 py-6 text-center shadow-2xl border border-purple-300/30 max-w-sm">
						<div className="text-5xl mb-3">🏝️</div>
						<div className="text-white font-bold text-xl mb-2">Showcase Islands Unlocked!</div>
						<div className="text-purple-100/80 text-sm leading-relaxed mb-4">
							New islands have appeared in the outer seas. Discover them for powerful late-game
							upgrades!
						</div>
						<button
							onClick={() => setShowShowcaseUnlock(false)}
							className="pointer-events-auto px-6 py-2 bg-white/20 hover:bg-white/30 text-white font-medium rounded-lg transition-colors"
						>
							Continue
						</button>
					</div>
				</div>
			)}

			{/* Corners unlock notification */}
			{showCornersUnlock && (
				<div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-in fade-in zoom-in duration-300">
					<div className="bg-linear-to-br from-gray-900/95 to-red-950/95 backdrop-blur-md rounded-2xl px-8 py-6 text-center shadow-2xl border border-red-500/30 max-w-sm">
						<div className="text-5xl mb-3">💀</div>
						<div className="text-red-400 font-bold text-xl mb-2">The Four Corners Await</div>
						<div className="text-gray-300/90 text-sm leading-relaxed mb-4">
							Ancient islands have emerged in each corner of the sea, guarded by fearsome captains.
							Only the most skilled sailors dare approach.
						</div>
						<div className="text-red-400/70 text-xs mb-4 italic">
							Warning: These guardians show no mercy.
						</div>
						<button
							onClick={() => setShowCornersUnlock(false)}
							className="pointer-events-auto px-6 py-2 bg-red-600/50 hover:bg-red-600/70 text-white font-medium rounded-lg transition-colors"
						>
							Face Your Doom
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
