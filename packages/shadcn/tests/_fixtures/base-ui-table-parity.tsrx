// The SAME table markup rendered through the Base UI base and through the radix base.
//
// `table` is base-independent: neither Radix nor Base UI publishes a table primitive, so upstream
// ships identical plain host elements in both. This fixture is what lets that claim be tested as
// behavior — two renders that must produce the same DOM — rather than as a comment nobody checks.
import {
	Table,
	TableBody,
	TableCaption,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
} from '@octanejs/shadcn/base-ui/Table';
import {
	Table as RTable,
	TableBody as RTableBody,
	TableCaption as RTableCaption,
	TableCell as RTableCell,
	TableFooter as RTableFooter,
	TableHead as RTableHead,
	TableHeader as RTableHeader,
	TableRow as RTableRow,
} from '@octanejs/shadcn/Table';

export function BaseUiTable() @{
	<Table>
		<TableCaption>Recent invoices</TableCaption>
		<TableHeader>
			<TableRow>
				<TableHead>Invoice</TableHead>
				<TableHead>Amount</TableHead>
			</TableRow>
		</TableHeader>
		<TableBody>
			<TableRow data-state="selected">
				<TableCell>INV-001</TableCell>
				<TableCell>$250.00</TableCell>
			</TableRow>
		</TableBody>
		<TableFooter>
			<TableRow>
				<TableCell>Total</TableCell>
				<TableCell>$250.00</TableCell>
			</TableRow>
		</TableFooter>
	</Table>
}

export function RadixTable() @{
	<RTable>
		<RTableCaption>Recent invoices</RTableCaption>
		<RTableHeader>
			<RTableRow>
				<RTableHead>Invoice</RTableHead>
				<RTableHead>Amount</RTableHead>
			</RTableRow>
		</RTableHeader>
		<RTableBody>
			<RTableRow data-state="selected">
				<RTableCell>INV-001</RTableCell>
				<RTableCell>$250.00</RTableCell>
			</RTableRow>
		</RTableBody>
		<RTableFooter>
			<RTableRow>
				<RTableCell>Total</RTableCell>
				<RTableCell>$250.00</RTableCell>
			</RTableRow>
		</RTableFooter>
	</RTable>
}
