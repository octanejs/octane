import { useState } from 'react';
import { useGameStore } from '../hooks/useGameStore';
import { getUpgradeTier, hasUnlock, type UpgradeType } from '../utils/upgrades';
import { RotateCcw } from 'lucide-react';

// Convert number to roman numeral
function toRoman(num: number): string {
	if (num <= 0) return '-';
	const numerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
	return numerals[num - 1] || num.toString();
}

// Get color class based on tier level
function getTierColor(tier: number, maxTier: number): string {
	if (tier <= 0) return 'text-white/20';
	const ratio = tier / maxTier;
	if (ratio >= 1) return 'text-amber-400'; // Maxed
	if (ratio >= 0.66) return 'text-green-400'; // High
	if (ratio >= 0.33) return 'text-cyan-400'; // Mid
	return 'text-white'; // Low
}

interface StatRowProps {
	icon: string;
	label: string;
	tier: number;
	maxTier?: number;
}

function StatRow({ icon, label, tier, maxTier = 3 }: StatRowProps) {
	return (
		<div className="flex items-center justify-between gap-3">
			<div className="flex items-center gap-2">
				<span className="text-sm">{icon}</span>
				<span className="text-white/50">{label}</span>
			</div>
			<span className={getTierColor(tier, maxTier)}>{toRoman(tier)}</span>
		</div>
	);
}

interface UnlockRowProps {
	icon: string;
	label: string;
	unlocked: boolean;
}

function UnlockRow({ icon, label, unlocked }: UnlockRowProps) {
	return (
		<div className="flex items-center justify-between gap-3">
			<div className="flex items-center gap-2">
				<span className="text-sm">{icon}</span>
				<span className={unlocked ? 'text-white/50' : 'text-white/20'}>{label}</span>
			</div>
			<span className={unlocked ? 'text-amber-400' : 'text-white/20'}>{unlocked ? '✓' : '-'}</span>
		</div>
	);
}

export function StatsHUD() {
	const { stage, unlockedUpgrades, kills, deaths, startOver } = useGameStore();
	const [showConfirm, setShowConfirm] = useState(false);

	// Only show in battle mode
	if (stage !== 'battle') return null;

	// Get tier levels for stackable upgrades
	const getTier = (type: UpgradeType) => getUpgradeTier(unlockedUpgrades, type);
	const hasUpgrade = (type: 'dualCannons' | 'doubleShot' | 'gatlingGuns' | 'acceleration') =>
		hasUnlock(unlockedUpgrades, type);

	const sailTier = getTier('sailSpeed');
	const turnTier = getTier('turnRate');
	const sideTier = getTier('sideFireRate');
	const frontTier = getTier('frontFireRate');
	const rangeTier = getTier('cannonRange');
	const healthTier = getTier('maxHealth');
	const regenTier = getTier('healthRegen');
	const fovTier = getTier('fieldOfView');

	const kd = deaths > 0 ? (kills / deaths).toFixed(1) : kills > 0 ? kills.toString() : '-';

	return (
		<div className="absolute top-16 right-4 z-10 pointer-events-auto hidden md:block">
			<div className="bg-black/40 backdrop-blur-sm rounded-lg px-4 py-3 text-xs text-white min-w-[150px] border border-white/5">
				{/* Speed */}
				<div className="space-y-1 mb-2">
					<StatRow icon="⚓" label="Sail" tier={sailTier} />
					<StatRow icon="↻" label="Turn" tier={turnTier} maxTier={2} />
					<UnlockRow icon="🚀" label="Accel" unlocked={hasUpgrade('acceleration')} />
				</div>

				<div className="border-t border-white/10 my-2" />

				{/* Combat */}
				<div className="space-y-1 mb-2">
					<StatRow icon="💨" label="Side" tier={sideTier} />
					<StatRow icon="🔥" label="Front" tier={frontTier} />
					<StatRow icon="🎯" label="Range" tier={rangeTier} />
				</div>

				<div className="border-t border-white/10 my-2" />

				{/* Defense */}
				<div className="space-y-1 mb-2">
					<StatRow icon="🛡️" label="Hull" tier={healthTier} />
					<StatRow icon="❤️‍🩹" label="Regen" tier={regenTier} maxTier={2} />
					<StatRow icon="🔭" label="FOV" tier={fovTier} maxTier={2} />
				</div>

				<div className="border-t border-white/10 my-2" />

				{/* Unlocks */}
				<div className="space-y-1 mb-2">
					<UnlockRow icon="⚔️" label="Dual" unlocked={hasUpgrade('dualCannons')} />
					<UnlockRow icon="💥" label="Double" unlocked={hasUpgrade('doubleShot')} />
					<UnlockRow icon="🔫" label="Gatling" unlocked={hasUpgrade('gatlingGuns')} />
				</div>

				<div className="border-t border-white/10 my-2" />

				{/* K/D */}
				<div className="flex items-center justify-between text-xs">
					<span className="text-red-400">{kills}K</span>
					<span className="text-white/30">/</span>
					<span className="text-white/50">{deaths}D</span>
					<span className="text-white/30">=</span>
					<span className="text-white/70">{kd}</span>
				</div>

				<div className="border-t border-white/10 my-2" />

				{/* Start Over */}
				{!showConfirm ? (
					<button
						onClick={() => setShowConfirm(true)}
						className="w-full flex items-center justify-center gap-1.5 text-[10px] text-white/30 hover:text-white/60 transition-colors"
					>
						<RotateCcw className="w-3 h-3" />
						<span>Reset</span>
					</button>
				) : (
					<div className="space-y-1.5">
						<p className="text-[10px] text-center text-red-400">Reset?</p>
						<div className="flex gap-1.5">
							<button
								onClick={() => setShowConfirm(false)}
								className="flex-1 text-[10px] py-1 rounded bg-white/10 hover:bg-white/20 text-white/50 transition-colors"
							>
								No
							</button>
							<button
								onClick={() => {
									startOver();
									setShowConfirm(false);
								}}
								className="flex-1 text-[10px] py-1 rounded bg-red-600/70 hover:bg-red-600 text-white transition-colors"
							>
								Yes
							</button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
