import { type OctaneNode } from 'octane';
import Years from './DecadeView/Years.tsrx';

type ComponentProps<T extends (...args: any) => any> =
	T extends (props: infer P, ...rest: any) => any ? P : never;

type DecadeViewProps = ComponentProps<typeof Years>;

/**
 * Displays a given decade.
 */
export default function DecadeView(props: DecadeViewProps): OctaneNode {
	function renderYears() {
		return <Years {...props} />;
	}

	return <div className="react-calendar__decade-view">{renderYears()}</div>;
}
