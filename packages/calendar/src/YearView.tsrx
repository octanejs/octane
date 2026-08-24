import { type OctaneNode } from 'octane';
import Months from './YearView/Months.tsrx';

type ComponentProps<T extends (...args: any) => any> =
	T extends (props: infer P, ...rest: any) => any ? P : never;

type YearViewProps = ComponentProps<typeof Months>;

/**
 * Displays a given year.
 */
export default function YearView(props: YearViewProps): OctaneNode {
	function renderMonths() {
		return <Months {...props} />;
	}

	return <div className="react-calendar__year-view">{renderMonths()}</div>;
}
