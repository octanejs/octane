import { useEffect, useRef, useState } from 'react';
import { GameEngine } from '../engine/GameEngine';

interface VanillaGameSceneProps {
	onLoadingChange?: (loading: boolean) => void;
}

export function VanillaGameScene({ onLoadingChange }: VanillaGameSceneProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const engineRef = useRef<GameEngine | null>(null);
	const [isReady, setIsReady] = useState(false);
	const canvasRef = useRef<HTMLCanvasElement>(null);

	// Wait for container to have dimensions
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const checkSize = () => {
			if (container.clientWidth > 0 && container.clientHeight > 0) {
				setIsReady(true);
			}
		};

		checkSize();
		requestAnimationFrame(checkSize);

		const observer = new ResizeObserver(checkSize);
		observer.observe(container);

		return () => observer.disconnect();
	}, []);

	// Initialize engine once ready
	useEffect(() => {
		if (!isReady) return;

		const canvas = canvasRef.current;
		const container = containerRef.current;
		if (!canvas || !container) return;

		// Set initial canvas size
		const width = container.clientWidth;
		const height = container.clientHeight;
		const dpr = Math.min(window.devicePixelRatio, 2);
		canvas.width = width * dpr;
		canvas.height = height * dpr;
		canvas.style.width = `${width}px`;
		canvas.style.height = `${height}px`;

		const engine = new GameEngine(canvas);
		engineRef.current = engine;

		// Handle container resize
		const resizeObserver = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (entry && engineRef.current) {
				const { width, height } = entry.contentRect;
				engineRef.current.resize(width, height);
			}
		});
		resizeObserver.observe(container);

		onLoadingChange?.(true);
		engine
			.init()
			.then(() => {
				engine.start();
				onLoadingChange?.(false);
			})
			.catch((err) => {
				console.error('GameEngine init failed:', err);
				onLoadingChange?.(false);
			});

		return () => {
			resizeObserver.disconnect();
			engine.dispose();
			engineRef.current = null;
		};
	}, [isReady, onLoadingChange]);

	return (
		<div ref={containerRef} style={{ width: '100%', height: '100%' }}>
			<canvas
				ref={canvasRef}
				style={{
					display: 'block',
					background: '#0EA5E9',
				}}
			/>
		</div>
	);
}
