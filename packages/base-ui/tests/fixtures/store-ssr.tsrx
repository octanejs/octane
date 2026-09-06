import * as React from 'octane';
import { Autocomplete } from '@octanejs/base-ui/autocomplete';

export function StoreServerCase1() {
	return <Autocomplete.Root items={['alpha', 'beta']} name="search">
		<Autocomplete.Input data-testid="input" />
		<Autocomplete.Portal>
			<Autocomplete.Positioner />
		</Autocomplete.Portal>
	</Autocomplete.Root>;
}
