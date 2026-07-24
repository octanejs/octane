import type { ButtonProps } from './button.tsrx';

type Props = { className?: string } & Record<string, unknown>;

export interface PaginationLinkProps extends Record<string, unknown> {
	className?: string;
	isActive?: boolean;
	size?: ButtonProps['size'];
	children?: unknown;
}

export function Pagination(props: Props): any;
export function PaginationContent(props: Props): any;
export function PaginationItem(props: Record<string, unknown>): any;
export function PaginationLink(props: PaginationLinkProps): any;
export function PaginationPrevious(props: PaginationLinkProps & { text?: string }): any;
export function PaginationNext(props: PaginationLinkProps & { text?: string }): any;
export function PaginationEllipsis(props: Props): any;
export {};
