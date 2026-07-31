import type { OctaneNode } from 'octane';
import { useContext, useEffect, useRef, useState } from 'octane';
import { StreamdownContext } from '../../index.tsrx';
import { useIcons } from '../icon-context.tsrx';
import { useCn } from '../prefix-context.tsrx';
import { useTranslations } from '../translations-context.tsrx';
import type { NativeMouseEvent } from '../types';
import { save } from '../utils';
import {
	extractTableDataFromElement,
	findTableForControl,
	tableDataToCSV,
	tableDataToMarkdown,
} from './utils';

export interface TableDownloadButtonProps {
	children?: OctaneNode;
	className?: string;
	filename?: string;
	format?: 'csv' | 'markdown';
	onDownload?: () => void;
	onError?: (error: Error) => void;
}

export const TableDownloadButton = ({
	children,
	className,
	onDownload,
	onError,
	format = 'csv',
	filename,
}: TableDownloadButtonProps) => {
	const cn = useCn();
	const { isAnimating } = useContext(StreamdownContext);
	const t = useTranslations();
	const icons = useIcons();

	const downloadTableData = (event: NativeMouseEvent<HTMLButtonElement>) => {
		try {
			const tableElement = findTableForControl(event.currentTarget);

			if (!tableElement) {
				onError?.(new Error('Table not found'));
				return;
			}

			const tableData = extractTableDataFromElement(tableElement);
			let content = '';
			let mimeType = '';
			let extension = '';

			switch (format) {
				case 'csv':
					content = tableDataToCSV(tableData);
					mimeType = 'text/csv';
					extension = 'csv';
					break;
				case 'markdown':
					content = tableDataToMarkdown(tableData);
					mimeType = 'text/markdown';
					extension = 'md';
					break;
				default:
					content = tableDataToCSV(tableData);
					mimeType = 'text/csv';
					extension = 'csv';
			}

			save(`${filename || 'table'}.${extension}`, content, mimeType);

			onDownload?.();
		} catch (error) {
			onError?.(error as Error);
		}
	};

	return <button
		className={cn(
			'cursor-pointer p-1 text-muted-foreground transition-all hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50',
			className,
		)}
		disabled={isAnimating}
		onClick={downloadTableData}
		title={format === 'csv' ? t.downloadTableAsCsv : t.downloadTableAsMarkdown}
		type="button"
	>
		{children ?? <icons.DownloadIcon size={14} />}
	</button>;
};

export interface TableDownloadDropdownProps {
	children?: OctaneNode;
	className?: string;
	onDownload?: (format: 'csv' | 'markdown') => void;
	onError?: (error: Error) => void;
}

export const TableDownloadDropdown = ({
	children,
	className,
	onDownload,
	onError,
}: TableDownloadDropdownProps) => {
	const cn = useCn();
	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement | null>(null);
	const { isAnimating } = useContext(StreamdownContext);
	const t = useTranslations();
	const icons = useIcons();

	const downloadTableData = (format: 'csv' | 'markdown') => {
		try {
			const tableElement = findTableForControl(dropdownRef.current);

			if (!tableElement) {
				onError?.(new Error('Table not found'));
				return;
			}

			const tableData = extractTableDataFromElement(tableElement);
			const content =
				format === 'csv' ? tableDataToCSV(tableData) : tableDataToMarkdown(tableData);
			const extension =
				format === 'csv' ? 'csv' : 'md';
			const filename = `table.${extension}`;
			const mimeType =
				format === 'csv' ? 'text/csv' : 'text/markdown';

			save(filename, content, mimeType);
			setIsOpen(false);
			onDownload?.(format);
		} catch (error) {
			onError?.(error as Error);
		}
	};

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			const path = event.composedPath();
			if (dropdownRef.current && !path.includes(dropdownRef.current)) {
				setIsOpen(false);
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, []);

	return <div className={cn('relative')} ref={dropdownRef}>
		<button
			className={cn(
				'cursor-pointer p-1 text-muted-foreground transition-all hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50',
				className,
			)}
			disabled={isAnimating}
			onClick={() => setIsOpen(!isOpen)}
			title={t.downloadTable}
			type="button"
		>
			{children ?? <icons.DownloadIcon size={14} />}
		</button>
		{isOpen
			? <div
					className={cn(
						'absolute top-full right-0 z-20 mt-1 min-w-[120px] overflow-hidden rounded-md border border-border bg-background shadow-lg',
					)}
				>
					<button
						className={cn('w-full px-3 py-2 text-left text-sm transition-colors hover:bg-muted/40')}
						onClick={() => downloadTableData('csv')}
						title={t.downloadTableAsCsv}
						type="button"
					>{t.tableFormatCsv}</button>
					<button
						className={cn('w-full px-3 py-2 text-left text-sm transition-colors hover:bg-muted/40')}
						onClick={() => downloadTableData('markdown')}
						title={t.downloadTableAsMarkdown}
						type="button"
					>{t.tableFormatMarkdown}</button>
				</div>
			: null}
	</div>;
};
