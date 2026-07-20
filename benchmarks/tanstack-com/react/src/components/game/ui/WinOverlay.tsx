/* eslint-disable react-hooks/set-state-in-effect -- game animation state sync */
import { useEffect, useState } from 'react';
import { useGameStore } from '../hooks/useGameStore';
import { Badge } from './BadgeOverlay';
import { BADGE_INFO } from '../machines/GameMachineProvider';

export function WinOverlay() {
	const { gameWon } = useGameStore();
	const [animationStep, setAnimationStep] = useState(0);
	const [dismissed, setDismissed] = useState(false);

	useEffect(() => {
		if (!gameWon) {
			setAnimationStep(0);
			setDismissed(false);
			return;
		}

		if (dismissed) return;

		const timers = [
			setTimeout(() => setAnimationStep(1), 300),
			setTimeout(() => setAnimationStep(2), 800),
			setTimeout(() => setAnimationStep(3), 1300),
			setTimeout(() => setAnimationStep(4), 1800),
			setTimeout(() => setAnimationStep(5), 2300),
		];

		return () => timers.forEach(clearTimeout);
	}, [gameWon, dismissed]);

	if (!gameWon || dismissed) return null;

	const badgeInfo = BADGE_INFO.conqueror;

	return (
		<div className="absolute inset-0 z-50 flex items-center justify-center p-8">
			{/* Background */}
			<div
				className="absolute inset-0 transition-opacity duration-700"
				style={{
					opacity: animationStep >= 1 ? 1 : 0,
					background: `radial-gradient(ellipse at center, ${badgeInfo.color}30 0%, rgba(0, 0, 0, 0.98) 100%)`,
				}}
			/>

			{/* Content */}
			<div
				className="relative z-10 max-w-lg w-full transition-all duration-500"
				style={{
					opacity: animationStep >= 1 ? 1 : 0,
					transform: animationStep >= 1 ? 'scale(1)' : 'scale(0.9)',
				}}
			>
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
						<Badge tier="conqueror" size="xl" showLabel={false} animate />
					</div>

					{/* Badge earned text */}
					<div
						className="transition-all duration-500 mb-2"
						style={{
							opacity: animationStep >= 2 ? 1 : 0,
							transform: animationStep >= 2 ? 'translateY(0)' : 'translateY(-10px)',
						}}
					>
						<p className="text-white/60 text-xs uppercase tracking-widest">Ultimate Badge Earned</p>
						<h2 className="text-3xl font-bold" style={{ color: badgeInfo.color }}>
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
						<h1 className="text-4xl font-bold text-white mb-2">Victory!</h1>
						<p className="text-yellow-300 text-sm uppercase tracking-wider font-medium">
							You conquered all four corners!
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

					{/* Message */}
					<div
						className="transition-all duration-500"
						style={{
							opacity: animationStep >= 3 ? 1 : 0,
							transform: animationStep >= 3 ? 'translateY(0)' : 'translateY(10px)',
						}}
					>
						<p className="text-gray-300 text-sm mb-2">
							You've defeated all four corner bosses and captured their islands.
						</p>
						<p className="text-gray-400 text-xs">You are the ultimate TanStack explorer!</p>
					</div>

					{/* Share */}
					<div
						className="mt-6 transition-all duration-500"
						style={{
							opacity: animationStep >= 4 ? 1 : 0,
							transform: animationStep >= 4 ? 'translateY(0)' : 'translateY(10px)',
						}}
					>
						<p className="text-white/50 text-xs mb-3">Share your victory!</p>
						<div className="flex gap-3 justify-center mb-4">
							<button
								onClick={() => {
									const text = `I just conquered TanStack Island Explorer! ${badgeInfo.icon} Earned the ${badgeInfo.name} badge by defeating all corner bosses!`;
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
							<button
								onClick={() => {
									navigator.clipboard.writeText(
										`I just conquered TanStack Island Explorer! ${badgeInfo.icon} https://tanstack.com/explore`,
									);
								}}
								className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors"
							>
								Copy Link
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
							onClick={() => setDismissed(true)}
							className="w-full py-3 px-6 rounded-xl font-semibold text-lg text-white transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
							style={{
								background: `linear-gradient(135deg, ${badgeInfo.color} 0%, ${badgeInfo.color}cc 100%)`,
								boxShadow: `0 4px 15px ${badgeInfo.color}66`,
							}}
						>
							Continue Exploring
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
