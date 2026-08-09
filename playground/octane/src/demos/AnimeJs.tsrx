import { animate, type JSAnimation, useAnimeScope } from '@octanejs/animejs';
import { Canvas } from '@octanejs/three';
import { useEffect, useRef, useState } from 'octane';
import { AnimeJsScene } from './AnimeJsScene.three.tsrx';

function usePrefersReducedMotion() {
	const [reducedMotion, setReducedMotion] = useState<boolean | undefined>(undefined);

	useEffect(() => {
		const media = window.matchMedia('(prefers-reduced-motion: reduce)');
		const updatePreference = () => setReducedMotion(media.matches);
		media.addEventListener('change', updatePreference);
		updatePreference();
		return () => media.removeEventListener('change', updatePreference);
	}, []);

	return reducedMotion;
}

export function AnimeJsDemo() @{
	const domAnimation = useRef<JSAnimation | undefined>(undefined);
	const reducedMotion = usePrefersReducedMotion();
	const animation = useAnimeScope(() => {
		if (reducedMotion === undefined) return;
		domAnimation.current = animate('.animejs-orb', {
			x: [0, 220],
			rotate: 360,
			scale: [0.75, 1.15],
			duration: 1_600,
			ease: 'inOut(3)',
			alternate: true,
			loop: true,
			autoplay: !reducedMotion,
		});
		return () => {
			domAnimation.current = undefined;
		};
	}, [reducedMotion]);

	<div>
		<h2 class="demo-title">{'Anime.js on Octane'}</h2>
		<p
			class="demo-blurb"
		>{'One scoped DOM animation and the official Anime.js Three adapter driving an @octanejs/three object.'}</p>

		<div class="panel animejs-grid">
			<section>
				<div class="animejs-section-heading">
					<h3>{'Scoped DOM animation'}</h3>
					<div class="animejs-controls">
						<button class="btn" onClick={() => domAnimation.current?.play()}>
							Start
						</button>
						<button class="btn" onClick={() => domAnimation.current?.reverse()}>
							Reverse
						</button>
						<button class="btn" onClick={() => animation.scope.current?.refresh()}>
							Refresh
						</button>
						<button class="btn" onClick={() => domAnimation.current?.revert()}>
							Reset
						</button>
					</div>
				</div>
				<div ref={animation.root} class="animejs-track">
					<div class="animejs-orb" />
				</div>
			</section>

			<section>
				<h3>{'Three.js adapter · demand loop'}</h3>
				<div class="animejs-canvas">
					@try {
						<Canvas
							frameloop="demand"
							camera={{ position: [0, 0, 4.5], fov: 42 }}
							style={{ width: '100%', height: '100%' }}
						>
							<ambientLight intensity={1.2} />
							<directionalLight position={[2, 3, 4]} intensity={2.4} />
							<AnimeJsScene reducedMotion={reducedMotion} />
						</Canvas>
					} @pending {
						<p>{'Starting WebGL…'}</p>
					} @catch (error) {
						<p>{'WebGL unavailable in this browser.'}</p>
					}
				</div>
			</section>
		</div>

		<style>
			.animejs-grid {
				display: grid;
				grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
				gap: 1rem;
			}
			.animejs-grid h3 {
				margin: 0 0 0.75rem;
				font-size: 0.9rem;
			}
			.animejs-section-heading {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 1rem;
			}
			.animejs-controls {
				display: flex;
				flex-wrap: wrap;
				justify-content: flex-end;
				gap: 0.4rem;
			}
			.animejs-track {
				height: 13rem;
				overflow: hidden;
				border: 1px solid var(--border);
				border-radius: calc(var(--radius) * 0.8);
				background: linear-gradient(135deg, var(--muted), var(--background));
			}
			.animejs-orb {
				width: 3rem;
				height: 3rem;
				margin: 5rem 0 0 1.25rem;
				border-radius: 35%;
				background: #ff4d8d;
				box-shadow: 0 1rem 2.5rem color-mix(in srgb, #ff4d8d 45%, transparent);
			}
			.animejs-canvas {
				height: 13rem;
				overflow: hidden;
				border: 1px solid var(--border);
				border-radius: calc(var(--radius) * 0.8);
				background: #11131a;
			}
		</style>
	</div>
}
