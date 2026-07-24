// TEMP review fixture — delete after audit.
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuCheckboxItem,
	DropdownMenuSub,
	DropdownMenuSubTrigger,
	DropdownMenuSubContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
} from '../../src/ui/dropdown-menu.tsrx';
import { Dialog, DialogTrigger, DialogContent, DialogTitle } from '../../src/ui/dialog.tsrx';
import { BreadcrumbSeparator } from '../../src/ui/breadcrumb.tsrx';
import { PaginationPrevious } from '../../src/ui/pagination.tsrx';

export function AuditMenuFixture() @{
	<DropdownMenu>
		<DropdownMenuTrigger data-testid="t">Open</DropdownMenuTrigger>
		<DropdownMenuContent data-testid="c">
			<DropdownMenuCheckboxItem data-testid="check" checked>
				<em data-testid="check-kid">CheckLabel</em>
			</DropdownMenuCheckboxItem>
			<DropdownMenuSub>
				<DropdownMenuSubTrigger data-testid="sub">
					<em data-testid="sub-kid">SubLabel</em>
				</DropdownMenuSubTrigger>
				<DropdownMenuSubContent />
			</DropdownMenuSub>
			<DropdownMenuRadioGroup value="a">
				<DropdownMenuRadioItem data-testid="radio" value="a">
					<em data-testid="radio-kid">RadioLabel</em>
				</DropdownMenuRadioItem>
			</DropdownMenuRadioGroup>
		</DropdownMenuContent>
	</DropdownMenu>
}

export function AuditDialogFixture() @{
	<Dialog defaultOpen>
		<DialogTrigger data-testid="dt">Open</DialogTrigger>
		<DialogContent data-testid="dc">
			<DialogTitle>Title</DialogTitle>
			<em data-testid="dialog-kid">DialogKid</em>
		</DialogContent>
	</Dialog>
}

export function AuditMiscFixture() @{
	<div>
		<BreadcrumbSeparator data-testid="sep">
			<em data-testid="sep-kid">/</em>
		</BreadcrumbSeparator>
		<PaginationPrevious data-testid="prev" href="#prev" />
	</div>
}
