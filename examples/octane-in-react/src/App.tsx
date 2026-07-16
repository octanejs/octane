import { useState } from 'react';
import { OctaneWrapper, wrapOctane } from '@octanejs/react-wrapper';
import { Card } from './octane/Card.tsrx';
import { Clock } from './octane/Clock.tsrx';
import { Counter } from './octane/Counter.tsrx';

const OctaneCounter = wrapOctane(Counter, { displayName: 'OctaneCounter' });
const OctaneClock = wrapOctane(Clock, { displayName: 'OctaneClock' });

export function App() {
	const [step, setStep] = useState(1);
	const [showClock, setShowClock] = useState(true);
	const [name, setName] = useState('');

	return (
		<main>
			<h1>Octane in React</h1>
			<p>
				A plain React app (real <code>react-dom</code>) mounting compiled Octane components through{' '}
				<code>@octanejs/react-wrapper</code>.
			</p>

			<section>
				<h2>Props flow in, Octane state survives</h2>
				<label>
					React-controlled step: {step}
					<input
						type="range"
						min={1}
						max={10}
						value={step}
						onChange={(e) => setStep(Number(e.target.value))}
					/>
				</label>
				<OctaneCounter label="Compiled .tsrx counter" step={step} />
			</section>

			<section>
				<h2>React children inside an Octane card</h2>
				<OctaneWrapper component={Card} props={{ title: 'Octane renders this frame' }}>
					<form onSubmit={(e) => e.preventDefault()}>
						<input
							placeholder="React-controlled input"
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
						<p>
							Hello {name || 'stranger'} — this form is React state and React events, rendered
							inside Octane DOM.
						</p>
					</form>
				</OctaneWrapper>
			</section>

			<section>
				<h2>Unmount runs Octane effect cleanups</h2>
				<label>
					<input
						type="checkbox"
						checked={showClock}
						onChange={(e) => setShowClock(e.target.checked)}
					/>
					show clock
				</label>
				{showClock ? <OctaneClock /> : null}
			</section>
		</main>
	);
}
