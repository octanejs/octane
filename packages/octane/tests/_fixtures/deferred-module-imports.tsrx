import defer * as slow from './basic.tsrx';
import * as eager from './actions.tsrx';

export const loadLater = import.defer('./activity.tsrx');
export const readModules = () => [slow.Hello, eager.ActionForm];

export function App() @{
	<p>{'Ready'}</p>
}
