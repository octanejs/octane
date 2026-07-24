import type { OctaneNode } from 'octane';

type Props = { className?: string } & Record<string, unknown>;

export interface SelectTriggerProps extends Record<string, unknown> {
	className?: string;
	size?: 'sm' | 'default';
	children?: OctaneNode;
}

export interface SelectContentProps extends Record<string, unknown> {
	className?: string;
	position?: 'item-aligned' | 'popper';
	align?: 'start' | 'center' | 'end';
	children?: OctaneNode;
}

export interface SelectItemProps extends Record<string, unknown> {
	className?: string;
	children?: OctaneNode;
}

export function Select(props: Record<string, unknown>): any;
export function SelectGroup(props: Props): any;
export function SelectValue(props: Record<string, unknown>): any;
export function SelectTrigger(props: SelectTriggerProps): any;
export function SelectContent(props: SelectContentProps): any;
export function SelectLabel(props: Props): any;
export function SelectItem(props: SelectItemProps): any;
export function SelectSeparator(props: Props): any;
export function SelectScrollUpButton(props: Props): any;
export function SelectScrollDownButton(props: Props): any;
