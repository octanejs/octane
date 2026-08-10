import { createRoot, delegateEvents, useState } from 'octane';
import { DayPicker } from '../../../src/index.ts';
import '../../../src/style.css';

delegateEvents(['blur', 'click', 'focus', 'keydown', 'mouseenter', 'mouseleave']);

function BrowserCalendar() @{
	const [selected, setSelected] = useState<Date | undefined>();
	<main>
		<output id="selected-date">{selected?.toISOString().slice(0, 10) ?? 'none'}</output>
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
