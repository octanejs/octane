import { useState } from 'octane';

import { LYNX_MODE_ROWS, LYNX_MODE_TITLE, lynxModeChecksum } from './semantics.js';

export function App() @{
	const [selected, setSelected] = useState('none');
	<view id="lynx-mode-shell">
		<text id="lynx-mode-title">{LYNX_MODE_TITLE}</text>
		<text id="lynx-mode-selection">{'Selected: ' + selected}</text>
		<text id="lynx-mode-checksum">{'Checksum: ' + lynxModeChecksum()}</text>
		@for (const row of LYNX_MODE_ROWS; key row.id) {
			<view id={'lynx-mode-row-' + row.id} bindtap={() => setSelected('lynx-mode-event-' + row.id)}>
				<text>{row.label + ': ' + row.score + ':' + row.token}</text>
			</view>
		}
	</view>
}
