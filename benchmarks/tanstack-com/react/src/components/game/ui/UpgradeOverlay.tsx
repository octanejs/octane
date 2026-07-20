/* eslint-disable react-hooks/set-state-in-effect -- game animation state sync */
import { useEffect, useState } from 'react';
import { useGameStore } from '../hooks/useGameStore';
import { Badge } from './BadgeOverlay';
import { BADGE_INFO } from '../machines/GameMachineProvider';

export function UpgradeOverlay() {
	const { phase, setPhase, setBoatType } = useGameStore();
	const [animationStep, setAnimationStep] = useState(0);

	useEffect(() => {
		if (phase !== 'upgrading') {
			setAnimationStep(0);
			return;
		}

		// Animation sequence
		const timers = [
			setTimeout(() => setAnimationStep(1), 300),
			setTimeout(() => setAnimationStep(2), 800),
			setTimeout(() => setAnimationStep(3), 1300),
			setTimeout(() => setAnimationStep(4), 1800),
			setTimeout(() => setAnimationStep(5), 2300),
		];

		return () => timers.forEach(clearTimeout);
	}, [phase]);

	const handleContinue = () => {
		setBoatType('ship');
		setPhase('playing');
	};

	if (phase !== 'upgrading') return null;

	const badgeInfo = BADGE_INFO.explorer;

	return (
		<div className="absolute inset-0 z-50 flex items-center justify-center p-8">
			{/* Animated background */}
			<div
				className="absolute inset-0 transition-opacity duration-700"
				style={{
					opacity: animationStep >= 1 ? 1 : 0,
					background: `radial-gradient(ellipse at center, ${badgeInfo.color}30 0%, rgba(0, 0, 0, 0.98) 100%)`,
				}}
			/>

			{/* Content card */}
			<div
				className="relative z-10 max-w-lg w-full transition-all duration-500"
				style={{
					opacity: animationStep >= 1 ? 1 : 0,
					transform: animationStep >= 1 ? 'scale(1)' : 'scale(0.9)',
				}}
			>
				{/* Card with glass effect */}
				<div
					className="rounded-2xl p-8 text-center"
					style={{
						background:
							'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
						backdropFilter: 'blur(10px)',
						border: '1px solid rgba(255,255,255,0.15)',
						boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
					}}
				>
					{/* Badge */}
					<div
						className="transition-all duration-700 mb-4"
						style={{
							opacity: animationStep >= 1 ? 1 : 0,
							transform: animationStep >= 1 ? 'scale(1) rotate(0deg)' : 'scale(0) rotate(-180deg)',
						}}
					>
						<Badge tier="explorer" size="lg" showLabel={false} />
					</div>

					{/* Badge earned text */}
					<div
						className="transition-all duration-500 mb-2"
						style={{
							opacity: animationStep >= 2 ? 1 : 0,
							transform: animationStep >= 2 ? 'translateY(0)' : 'translateY(-10px)',
						}}
					>
						<p className="text-white/60 text-xs uppercase tracking-widest">Badge Earned</p>
						<h2 className="text-2xl font-bold" style={{ color: badgeInfo.color }}>
							{badgeInfo.name}
						</h2>
					</div>

					{/* Title */}
					<div
						className="transition-all duration-500"
						style={{
							opacity: animationStep >= 2 ? 1 : 0,
							transform: animationStep >= 2 ? 'translateY(0)' : 'translateY(10px)',
						}}
					>
						<h1 className="text-3xl font-bold text-white mb-2">All Libraries Discovered!</h1>
						<p className="text-cyan-300 text-sm uppercase tracking-wider font-medium">
							Exploration Complete
						</p>
					</div>

					{/* Divider */}
					<div
						className="my-6 h-px transition-all duration-500"
						style={{
							opacity: animationStep >= 3 ? 0.3 : 0,
							background: 'linear-gradient(90deg, transparent, white, transparent)',
						}}
					/>

					{/* Upgrade info */}
					<div
						className="transition-all duration-500 space-y-4"
						style={{
							opacity: animationStep >= 3 ? 1 : 0,
							transform: animationStep >= 3 ? 'translateY(0)' : 'translateY(10px)',
						}}
					>
						<div className="flex items-center justify-center gap-3 text-white">
							<span className="text-2xl">🚣</span>
							<span className="text-gray-400">→</span>
							<span className="text-2xl">🚢</span>
						</div>
						<p className="text-white text-lg">
							Your rowboat has been upgraded to a{' '}
							<span className="text-cyan-400 font-semibold">Battle Ship</span>
						</p>

						<div className="flex flex-wrap justify-center gap-3 mt-4">
							<div className="px-3 py-1.5 rounded-full bg-white/10 text-sm text-gray-200">
								Expanded World
							</div>
							<div className="px-3 py-1.5 rounded-full bg-white/10 text-sm text-gray-200">
								Side Cannons
							</div>
							<div className="px-3 py-1.5 rounded-full bg-white/10 text-sm text-gray-200">
								Partner Islands
							</div>
						</div>

						<p className="text-gray-400 text-sm mt-4">
							Press{' '}
							<kbd className="px-2 py-0.5 rounded bg-white/20 text-white font-mono">SPACE</kbd> to
							fire cannons
						</p>
					</div>

					{/* Share + Continue */}
					<div
						className="mt-6 transition-all duration-500"
						style={{
							opacity: animationStep >= 4 ? 1 : 0,
							transform: animationStep >= 4 ? 'translateY(0)' : 'translateY(10px)',
						}}
					>
						<p className="text-white/50 text-xs mb-3">Share your achievement!</p>
						<div className="flex gap-3 justify-center mb-4">
							<button
								onClick={() => {
									const text = `I just earned the ${badgeInfo.name} badge in TanStack Island Explorer! ${badgeInfo.icon} Discovered all the TanStack libraries!`;
									const url = 'https://tanstack.com/explore';
									window.open(
										`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
										'_blank',
									);
								}}
								className="px-4 py-2 rounded-lg bg-[#1DA1F2]/20 hover:bg-[#1DA1F2]/30 text-[#1DA1F2] text-sm font-medium transition-colors"
							>
								Share on X
							</button>
						</div>
					</div>

					{/* Button */}
					<div
						className="transition-all duration-500"
						style={{
							opacity: animationStep >= 5 ? 1 : 0,
							transform: animationStep >= 5 ? 'translateY(0)' : 'translateY(10px)',
						}}
					>
						<button
							onClick={handleContinue}
							className="w-full py-3 px-6 rounded-xl font-semibold text-lg text-white transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
							style={{
								background: `linear-gradient(135deg, ${badgeInfo.color} 0%, ${badgeInfo.color}cc 100%)`,
								boxShadow: `0 4px 15px ${badgeInfo.color}66`,
							}}
						>
							Set Sail!
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
