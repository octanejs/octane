import { type OctaneNode } from 'octane';
import Decades from './CenturyView/Decades.tsrx';

type ComponentProps<T extends (...args: any) => any> =
	T extends (props: infer P, ...rest: any) => any ? P : never;

type CenturyViewProps = ComponentProps<typeof Decades>;

/**
 * Displays a given century.
 */
export default function CenturyView(props: CenturyViewProps): OctaneNode {
	function renderDecades() {
		return <Decades {...props} />;
	}

	return <div className="react-calendar__century-view">{renderDecades()}</div>;
}
