/* eslint-disable react-hooks/set-state-in-effect -- game animation state sync */
import { useEffect, useState } from 'react';
import { useProgression, BADGE_INFO, type BadgeTier } from '../machines/GameMachineProvider';

// Badge visual component (reusable)
export function Badge({
	tier,
	size = 'md',
	showLabel = true,
	animate = false,
}: {
	tier: BadgeTier;
	size?: 'sm' | 'md' | 'lg' | 'xl';
	showLabel?: boolean;
	animate?: boolean;
}) {
	const info = BADGE_INFO[tier];

	const sizeClasses = {
		sm: 'w-12 h-12 text-xl',
		md: 'w-20 h-20 text-3xl',
		lg: 'w-28 h-28 text-5xl',
		xl: 'w-36 h-36 text-6xl',
	};

	const labelSizes = {
		sm: 'text-xs',
		md: 'text-sm',
		lg: 'text-lg',
		xl: 'text-xl',
	};

	return (
		<div className="flex flex-col items-center gap-2">
			{/* Badge coin */}
			<div
				className={`${sizeClasses[size]} rounded-full flex items-center justify-center shadow-xl relative overflow-hidden ${animate ? 'animate-pulse' : ''}`}
				style={{
					background: `linear-gradient(135deg, ${info.color}ee 0%, ${info.color}99 50%, ${info.color}ee 100%)`,
					boxShadow: `0 0 30px ${info.color}66, inset 0 2px 10px rgba(255,255,255,0.3), inset 0 -2px 10px rgba(0,0,0,0.2)`,
					border: `3px solid ${info.color}`,
				}}
			>
				{/* Inner ring */}
				<div
					className="absolute inset-2 rounded-full"
					style={{
						border: `2px solid rgba(255,255,255,0.3)`,
					}}
				/>
				{/* Icon */}
				<span className="relative z-10 drop-shadow-lg">{info.icon}</span>
				{/* Shine effect */}
				<div
					className="absolute inset-0 opacity-30"
					style={{
						background:
							'linear-gradient(135deg, rgba(255,255,255,0.8) 0%, transparent 50%, transparent 100%)',
					}}
				/>
			</div>

			{/* Label */}
			{showLabel && (
				<div className="text-center">
					<div className={`font-bold ${labelSizes[size]}`} style={{ color: info.color }}>
						{info.name}
					</div>
				</div>
			)}
		</div>
	);
}

// Overlay shown when a new badge is earned
// Only shows for adventurer and champion - explorer/conqueror are shown in their own overlays
export function BadgeOverlay() {
	const { newBadgeEarned, dismissBadge } = useProgression();
	const [animationStep, setAnimationStep] = useState(0);
	const [visible, setVisible] = useState(false);

	// Only show for adventurer and champion badges
	const shouldShow = newBadgeEarned === 'adventurer' || newBadgeEarned === 'champion';

	useEffect(() => {
		if (!shouldShow) {
			setAnimationStep(0);
			setVisible(false);
			return;
		}

		setVisible(true);

		const timers = [
			setTimeout(() => setAnimationStep(1), 100),
			setTimeout(() => setAnimationStep(2), 600),
			setTimeout(() => setAnimationStep(3), 1100),
			setTimeout(() => setAnimationStep(4), 1600),
		];

		return () => timers.forEach(clearTimeout);
	}, [shouldShow]);

	const handleDismiss = () => {
		setVisible(false);
		setTimeout(() => dismissBadge(), 300);
	};

	if (!shouldShow || !visible) return null;

	const info = BADGE_INFO[newBadgeEarned!];

	return (
		<div className="absolute inset-0 z-[60] flex items-center justify-center p-8">
			{/* Background */}
			{/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- Game overlay dismiss */}
			<div
				className="absolute inset-0 transition-opacity duration-500"
				style={{
					opacity: animationStep >= 1 ? 1 : 0,
					background: `radial-gradient(ellipse at center, ${info.color}40 0%, rgba(0, 0, 0, 0.95) 100%)`,
				}}
				onClick={handleDismiss}
			/>

			{/* Content */}
			<div
				className="relative z-10 max-w-md w-full transition-all duration-500"
				style={{
					opacity: animationStep >= 1 ? 1 : 0,
					transform: animationStep >= 1 ? 'scale(1)' : 'scale(0.8)',
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
					{/* Badge earned text */}
					<div
						className="transition-all duration-500 mb-6"
						style={{
							opacity: animationStep >= 1 ? 1 : 0,
							transform: animationStep >= 1 ? 'translateY(0)' : 'translateY(-20px)',
						}}
					>
						<p className="text-white/60 text-sm uppercase tracking-widest font-medium">
							Badge Earned
						</p>
					</div>

					{/* Badge */}
					<div
						className="transition-all duration-700 mb-6"
						style={{
							opacity: animationStep >= 2 ? 1 : 0,
							transform: animationStep >= 2 ? 'scale(1) rotate(0deg)' : 'scale(0) rotate(-180deg)',
						}}
					>
						<Badge tier={newBadgeEarned} size="xl" showLabel={false} animate />
					</div>

					{/* Badge name */}
					<div
						className="transition-all duration-500"
						style={{
							opacity: animationStep >= 3 ? 1 : 0,
							transform: animationStep >= 3 ? 'translateY(0)' : 'translateY(10px)',
						}}
					>
						<h2 className="text-3xl font-bold mb-2" style={{ color: info.color }}>
							{info.name}
						</h2>
						<p className="text-white/80 text-sm">{info.description}</p>
					</div>

					{/* Divider */}
					<div
						className="my-6 h-px transition-all duration-500"
						style={{
							opacity: animationStep >= 3 ? 0.3 : 0,
							background: 'linear-gradient(90deg, transparent, white, transparent)',
						}}
					/>

					{/* Share prompt */}
					<div
						className="transition-all duration-500"
						style={{
							opacity: animationStep >= 4 ? 1 : 0,
							transform: animationStep >= 4 ? 'translateY(0)' : 'translateY(10px)',
						}}
					>
						<p className="text-white/50 text-xs mb-4">Share your achievement!</p>

						<div className="flex gap-3 justify-center mb-4">
							<button
								onClick={() => {
									const text = `I just earned the ${info.name} badge in TanStack Island Explorer! ${info.icon}`;
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
										`I just earned the ${info.name} badge in TanStack Island Explorer! ${info.icon} https://tanstack.com/explore`,
									);
								}}
								className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors"
							>
								Copy Link
							</button>
						</div>

						<button
							onClick={handleDismiss}
							className="w-full py-3 px-6 rounded-xl font-semibold text-lg text-white transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
							style={{
								background: `linear-gradient(135deg, ${info.color} 0%, ${info.color}cc 100%)`,
								boxShadow: `0 4px 15px ${info.color}66`,
							}}
						>
							Continue
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
