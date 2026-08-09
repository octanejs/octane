import gsap from 'gsap';
import { useGSAP } from '@octanejs/gsap';
import { useRef, useState } from 'octane';

export function GSAPDemo() @{
	const scope = useRef<HTMLDivElement>(null);
	const [direction, setDirection] = useState(1);
	const { contextSafe } = useGSAP(() => {
		gsap.fromTo('.gsap-orb', { x: direction > 0 ? -110 : 110, rotate: direction > 0 ? -30 : 30 }, {
			x: 0,
			rotate: 0,
			duration: 0.7,
			ease: 'back.out(1.7)',
			stagger: 0.08,
		});
	}, { scope, dependencies: [direction], revertOnUpdate: true });

	const pulse = contextSafe(() => {
		gsap.to('.gsap-orb', {
			scale: 1.18,
			duration: 0.16,
			stagger: { each: 0.06, yoyo: true, repeat: 1 },
		});
	});

	<div ref={scope}>
		<h2 class="demo-title">{'GSAP on Octane'}</h2>
		<p
			class="demo-blurb"
		>{'Scoped timelines, dependency cleanup, and context-safe event animations through useGSAP.'}</p>
		<div class="panel gsap-stage" aria-label="GSAP animation stage">
			<div class="gsap-orb">G</div>
			<div class="gsap-orb">S</div>
			<div class="gsap-orb">A</div>
			<div class="gsap-orb">P</div>
		</div>
		<div class="row">
			<button class="btn" id="gsap-replay" onClick={() => setDirection((value) => value * -1)}>
				Replay from
				{direction > 0 ? 'right' : 'left'}
			</button>
			<button class="btn" id="gsap-pulse" onClick={pulse}>Pulse safely</button>
		</div>
	</div>
}
