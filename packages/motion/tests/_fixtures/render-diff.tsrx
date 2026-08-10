import { motion } from '@octanejs/motion';
import { useState } from 'octane';

export function MotionCard() @{
	const [label, setLabel] = useState('before');
	<motion.div id="card" className="panel" initial={false} drag={false}>
		<span id="label">{label}</span>
		<button id="toggle" onClick={() => setLabel('after')}>toggle</button>
	</motion.div>
}
