import type { CSSProperties } from 'react';
import { createElement } from 'octane';

import type { ChartA11yConfig } from '../types';
import { getChartA11yTable, VISUALLY_HIDDEN_STYLE } from '../utils/table';

export type ChartA11yDataTableProps<Datum> = ChartA11yConfig<Datum> & {
		visible?: boolean;
		className?: string;
		style?: CSSProperties;
	};

export function ChartA11yDataTable<Datum>({
	visible = false,
	className,
	style,
	...config
}: ChartA11yDataTableProps<Datum>) {
	const table = getChartA11yTable(config);
	const tableStyle = visible ? style : { ...VISUALLY_HIDDEN_STYLE, ...style };
	const headerCells = table.headers.map(
		(header, index) => createElement('th', { key: `${header}-${index}`, scope: 'col' }, header),
	);
	const bodyRows = table.rows.map(
		([xCell, ...yCells], rowIndex) => createElement(
			'tr',
			{ key: rowIndex },
			createElement('th', { scope: 'row' }, xCell),
			yCells.map((cell, cellIndex) => createElement('td', { key: cellIndex }, cell)),
		),
	);

	return <table id={table.id} className={className} style={tableStyle}>
		<caption>{table.caption}</caption>
		<thead>
			<tr>{headerCells}</tr>
		</thead>
		<tbody>{bodyRows}</tbody>
	</table>;
}
