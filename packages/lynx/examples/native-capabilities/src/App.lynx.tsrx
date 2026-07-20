import { useState } from 'octane';
import { getNativeModules, reportError } from '@octanejs/lynx/platform';

export function App() @{
	const [label, setLabel] = useState('Tap to call the app-owned module');

	function loadGreeting() {
		try {
			setLabel(getNativeModules().OctaneAccountModule.greeting('octane-user'));
		} catch (error) {
			reportError(error instanceof Error ? error : String(error));
		}
	}

	<view id="native-capabilities">
		<octane-badge label={label} bindtap={loadGreeting} />
	</view>
}
