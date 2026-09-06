import * as React from 'octane';
import { Fieldset } from '@octanejs/base-ui/fieldset';

export function FieldsetLegendServerCase1() {
	return <Fieldset.Root data-testid="fieldset" />;
}

export function FieldsetLegendServerCase2() {
	return <Fieldset.Root data-testid="fieldset">
		<Fieldset.Legend data-testid="legend">Legend</Fieldset.Legend>
	</Fieldset.Root>;
}
