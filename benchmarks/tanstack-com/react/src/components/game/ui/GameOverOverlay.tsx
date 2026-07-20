/* eslint-disable react-hooks/set-state-in-effect -- game animation state sync */
import { useEffect, useState } from 'react';
import { useGameStore } from '../hooks/useGameStore';

export function GameOverOverlay() {
	const { phase, restartBattle, addDeath } = useGameStore();
	const [animationStep, setAnimationStep] = useState(0);
	const [deathCounted, setDeathCounted] = useState(false);

	useEffect(() => {
		if (phase !== 'gameover') {
			setAnimationStep(0);
			setDeathCounted(false);
			return;
		}

		// Count the death once when game over starts
		if (!deathCounted) {
			addDeath();
			setDeathCounted(true);
		}

		const timers = [
			setTimeout(() => setAnimationStep(1), 300),
			setTimeout(() => setAnimationStep(2), 800),
			setTimeout(() => setAnimationStep(3), 1300),
		];

		return () => timers.forEach(clearTimeout);
	}, [phase, deathCounted, addDeath]);

	if (phase !== 'gameover') return null;

	return (
		<div className="absolute inset-0 z-50 flex items-center justify-center p-8">
			{/* Background */}
			<div
				className="absolute inset-0 transition-opacity duration-700"
				style={{
					opacity: animationStep >= 1 ? 1 : 0,
					background:
						'radial-gradient(ellipse at center, rgba(100, 20, 20, 0.95) 0%, rgba(0, 0, 0, 0.98) 100%)',
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
					{/* Icon */}
					<div
						className="transition-all duration-500 mb-4"
						style={{
							opacity: animationStep >= 1 ? 1 : 0,
							transform: animationStep >= 1 ? 'scale(1)' : 'scale(0.5)',
						}}
					>
						<div className="w-20 h-20 mx-auto rounded-full bg-linear-to-br from-red-500 to-red-700 flex items-center justify-center shadow-lg">
							<span className="text-4xl">💀</span>
						</div>
					</div>

					{/* Title */}
					<div
						className="transition-all duration-500"
						style={{
							opacity: animationStep >= 2 ? 1 : 0,
							transform: animationStep >= 2 ? 'translateY(0)' : 'translateY(10px)',
						}}
					>
						<h1 className="text-3xl font-bold text-white mb-2">Ship Sunk!</h1>
						<p className="text-red-300 text-sm uppercase tracking-wider font-medium">
							Your vessel has been destroyed
						</p>
					</div>

					{/* Divider */}
					<div
						className="my-6 h-px transition-all duration-500"
						style={{
							opacity: animationStep >= 2 ? 0.3 : 0,
							background: 'linear-gradient(90deg, transparent, white, transparent)',
						}}
					/>

					{/* Message */}
					<div
						className="transition-all duration-500"
						style={{
							opacity: animationStep >= 2 ? 1 : 0,
							transform: animationStep >= 2 ? 'translateY(0)' : 'translateY(10px)',
						}}
					>
						<p className="text-gray-300 text-sm mb-6">
							Your ship was sunk by enemy fire. All your upgrades and discoveries are safe. Ready to
							try again?
						</p>
					</div>

					{/* Button */}
					<div
						className="transition-all duration-500"
						style={{
							opacity: animationStep >= 3 ? 1 : 0,
							transform: animationStep >= 3 ? 'translateY(0)' : 'translateY(10px)',
						}}
					>
						<button
							onClick={restartBattle}
							className="w-full py-3 px-6 rounded-xl font-semibold text-lg text-white transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
							style={{
								background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
								boxShadow: '0 4px 15px rgba(239, 68, 68, 0.4)',
							}}
						>
							Sail Again!
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
