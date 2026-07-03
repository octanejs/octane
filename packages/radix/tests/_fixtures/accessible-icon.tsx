import { createElement } from 'octane';
import { AccessibleIcon } from '@octanejs/radix';

export function AccessibleIconApp() {
	return (
		<div data-testid="app">
			<AccessibleIcon.Root
				label="Close"
				children={[createElement('svg', { 'data-testid': 'icon', viewBox: '0 0 16 16' })]}
			/>
		</div>
	);
}
