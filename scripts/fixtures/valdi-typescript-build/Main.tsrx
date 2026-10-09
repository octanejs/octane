import { Widget as First } from './one/Widget.tsrx';
import { Widget as Second } from './two/Widget.tsrx';
import { useLabel } from './useLabel';

/** @ExportModel({ ios: 'FixtureModel', android: 'fixture.Model' }) */
export interface Props {
	label: string;
}

export const buildMarker: string = 'before-transform';

export function Main(props: Props) @{
	const [label, setLabel, getLabel] = useLabel(props.label);
	<view>
		<First label={label} />
		<Second label={label} />
		<label value={getLabel()} onTap={() => setLabel('edited')} />
	</view>
}

export function trace(props: Props): string {
	console.log(props.label);
	return props.label;
}

export function mappedFailure(props: Props): never {
	throw new Error(props.label);
}
