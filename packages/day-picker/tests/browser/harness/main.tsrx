import { createRoot, delegateEvents, useState } from 'octane';
import { DayPicker } from '../../../src/index.ts';
import '../../../src/style.css';

delegateEvents(['blur', 'click', 'focus', 'keydown', 'mouseenter', 'mouseleave']);

/** DayPicker reports local-midnight Dates; UTC rendering shifts the day east of UTC. */
const localIsoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
	2,
	'0',
)}-${String(date.getDate()).padStart(2, '0')}`;

function BrowserCalendar() @{
	const [selected, setSelected] = useState<Date | undefined>();
	<main>
		<output id="selected-date">
			{selected ? localIsoDate(selected) : 'none'}
		</output>
		<DayPicker
			animate
			mode="single"
			defaultMonth={new Date(2026, 7, 1)}
			selected={selected}
			onSelect={setSelected}
		/>
	</main>
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('missing #root');
createRoot(rootElement).render(BrowserCalendar);
