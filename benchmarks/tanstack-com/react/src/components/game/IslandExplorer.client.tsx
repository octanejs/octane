// Main Island Explorer game component
// Uses vanilla Three.js engine for better performance

import { useState } from 'react';

import { VanillaGameScene } from './scene/VanillaGameScene';
import { IntroOverlay } from './ui/IntroOverlay';
import { GameHUD } from './ui/GameHUD';
import { TouchControls } from './ui/TouchControls';
import { CompleteOverlay } from './ui/CompleteOverlay';
import { UpgradeOverlay } from './ui/UpgradeOverlay';
import { Minimap } from './ui/Minimap';
import { DebugPanel } from './ui/DebugPanel';
import { IslandIndicator } from './ui/IslandIndicator';
import { Shop } from './ui/Shop';
import { CompassIndicator } from './ui/CompassIndicator';
import { GameOverOverlay } from './ui/GameOverOverlay';
import { WinOverlay } from './ui/WinOverlay';
import { StatsHUD } from './ui/StatsHUD';
import { GameMachineProvider } from './machines/GameMachineProvider';
import { ProgressionSync } from './machines/ProgressionSync';
import { BadgeOverlay } from './ui/BadgeOverlay';

const LOADING_MESSAGES = [
	['Convincing the waves to behave...', 'They never listen'],
	['Teaching fish to avoid the boat...', 'Mixed results so far'],
	['Polishing the cannon balls...', 'Shiny = more damage, right?'],
	['Bribing the wind gods...', 'They only accept doubloons'],
	['Untangling the anchor chain...', 'Who even tied this?'],
	['Inflating the ocean...', 'It was looking a bit flat'],
	['Waking up the sea monsters...', 'Just kidding, letting them sleep'],
	['Calibrating the compass...', 'North is... that way. Probably.'],
	['Stocking up on seasickness bags...', 'Better safe than sorry'],
	['Negotiating with seagulls...', 'They want crackers'],
	['Waterproofing the treasure maps...', 'Learned that lesson the hard way'],
	['Training the AI pirates...', 'They keep missing on purpose'],
	['Generating procedural waves...', 'Each one is unique and special'],
	['Hiding easter eggs...', 'You will never find them all'],
	['Rendering exactly 7 million polygons...', 'Give or take a few'],
];

function LoadingOverlay() {
	const [messageIndex] = useState(() => Math.floor(Math.random() * LOADING_MESSAGES.length));
	const [headline, subtext] = LOADING_MESSAGES[messageIndex];

	return (
		<div className="absolute inset-0 bg-linear-to-b from-sky-400 to-cyan-600 flex items-center justify-center z-50">
			<div className="text-center">
				<div className="w-16 h-16 mx-auto mb-4 border-4 border-white/30 border-t-white rounded-full animate-spin" />
				<p className="text-white text-lg font-medium">{headline}</p>
				<p className="text-white/60 text-sm mt-2">{subtext}</p>
			</div>
		</div>
	);
}

export default function IslandExplorer() {
	const [isLoading, setIsLoading] = useState(true);

	return (
		<GameMachineProvider>
			<ProgressionSync />
			<div className="relative w-full h-[calc(100dvh-var(--navbar-height))] bg-sky-500">
				{/* Loading overlay */}
				{isLoading && <LoadingOverlay />}

				{/* 3D Scene */}
				<div className="absolute inset-0">
					<VanillaGameScene onLoadingChange={setIsLoading} />
				</div>

				{/* Vignette overlay for depth */}
				<div
					className="absolute inset-0 pointer-events-none"
					style={{
						background:
							'radial-gradient(ellipse at center, transparent 40%, rgba(0,20,40,0.3) 100%)',
					}}
				/>

				{/* UI Overlays */}
				<IntroOverlay />
				<UpgradeOverlay />
				<CompleteOverlay />
				<GameOverOverlay />
				<WinOverlay />
				<BadgeOverlay />
				<GameHUD />
				<StatsHUD />
				<Minimap />
				<IslandIndicator />
				<CompassIndicator />
				<TouchControls />
				<Shop />
				<DebugPanel />
			</div>
		</GameMachineProvider>
	);
}
