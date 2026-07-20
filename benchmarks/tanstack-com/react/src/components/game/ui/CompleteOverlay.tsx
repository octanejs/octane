import { Link } from '@tanstack/react-router';
import { useGameStore } from '../hooks/useGameStore';
import { Trophy, RotateCcw, Home } from 'lucide-react';

export function CompleteOverlay() {
	const { phase, reset, setPhase } = useGameStore();

	if (phase !== 'complete') return null;

	const handlePlayAgain = () => {
		reset();
		setPhase('playing');
	};

	return (
		<div className="absolute inset-0 z-20 flex items-center justify-center bg-linear-to-b from-amber-400/90 to-orange-500/90 backdrop-blur-sm">
			<div className="max-w-md mx-4 text-center">
				{/* Trophy */}
				<div className="w-24 h-24 mx-auto mb-6 bg-white/20 rounded-full flex items-center justify-center">
					<Trophy className="w-12 h-12 text-white" />
				</div>

				{/* Title */}
				<h1 className="text-4xl md:text-5xl font-black text-white mb-2 drop-shadow-lg">
					All Islands Found!
				</h1>
				<p className="text-lg text-white/90 mb-8">
					You've discovered all 13 TanStack libraries. You're officially a TanStack explorer!
				</p>

				{/* Actions */}
				<div className="flex flex-col sm:flex-row gap-3 justify-center">
					<button
						onClick={handlePlayAgain}
						className="flex items-center justify-center gap-2 px-6 py-3 bg-white text-orange-600 font-bold rounded-xl shadow-lg hover:bg-orange-50 hover:scale-105 transition-all duration-200"
					>
						<RotateCcw className="w-5 h-5" />
						Explore Again
					</button>
					<Link
						to="/"
						className="flex items-center justify-center gap-2 px-6 py-3 bg-white/20 text-white font-bold rounded-xl hover:bg-white/30 transition-all duration-200"
					>
						<Home className="w-5 h-5" />
						Back to TanStack
					</Link>
				</div>

				{/* Fun fact */}
				<p className="mt-8 text-white/60 text-sm">
					Fun fact: TanStack libraries are used by millions of developers worldwide!
				</p>
			</div>
		</div>
	);
}
