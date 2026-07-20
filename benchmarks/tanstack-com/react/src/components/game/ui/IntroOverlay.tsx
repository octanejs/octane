import { useState, useEffect } from 'react';
import { useGameStore } from '../hooks/useGameStore';

export function IntroOverlay() {
	const { phase, setPhase } = useGameStore();
	const [showControls, setShowControls] = useState(true);

	// Auto-start the game immediately
	useEffect(() => {
		if (phase === 'intro') {
			setPhase('playing');
		}
	}, [phase, setPhase]);

	// Hide controls after first input or after 5 seconds
	useEffect(() => {
		if (!showControls) return;

		const timer = setTimeout(() => {
			setShowControls(false);
		}, 6000);

		const handleInput = () => {
			setShowControls(false);
		};

		window.addEventListener('keydown', handleInput);
		window.addEventListener('touchstart', handleInput);

		return () => {
			clearTimeout(timer);
			window.removeEventListener('keydown', handleInput);
			window.removeEventListener('touchstart', handleInput);
		};
	}, [showControls]);

	if (phase !== 'playing' || !showControls) return null;

	return (
		<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
			<div className="bg-black/40 backdrop-blur-sm rounded-xl p-4 text-white text-center animate-in fade-in duration-500">
				<div className="flex flex-col sm:flex-row gap-4 items-center justify-center text-sm">
					<div className="flex items-center gap-2">
						<kbd className="px-2 py-1 bg-white/20 rounded font-mono">↑ ↓</kbd>
						<span className="text-white/80">sail</span>
					</div>
					<div className="flex items-center gap-2">
						<kbd className="px-2 py-1 bg-white/20 rounded font-mono">← →</kbd>
						<span className="text-white/80">steer</span>
					</div>
				</div>
				<p className="mt-2 text-xs text-white/50">tap anywhere to dismiss</p>
			</div>
		</div>
	);
}
