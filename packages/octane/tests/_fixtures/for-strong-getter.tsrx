'use strong';

import { useMemo, useState } from 'octane';

export function TupleGetterMethodRows() @{
	const tuple = useState(0);
	const getCount = tuple[2];
	const [getterRows] = useState([{ id: 1 }]);
	const getterReader = useMemo(() => ({ readCount: getCount }), [getCount]);
	<div>
		<button id="tuple-method-bump" onClick={() => tuple[1]((count) => count + 1)}>bump</button>
		<ul>
			@for (const getterRow of getterRows; key getterRow.id) {
				<li>{`${getterReader.readCount()}`}</li>
			}
		</ul>
	</div>
}
