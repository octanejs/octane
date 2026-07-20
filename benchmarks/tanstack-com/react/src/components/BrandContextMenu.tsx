import * as React from 'react';
import { useToast } from '~/components/ToastProvider';
import { useNavigate } from '@tanstack/react-router';
import { twMerge } from 'tailwind-merge';
import {
	Dropdown,
	DropdownTrigger,
	DropdownContent,
	DropdownItem,
	DropdownSeparator,
} from './Dropdown';
import { copyTextToClipboard } from '~/utils/browser-effects';

interface BrandContextMenuProps extends React.HTMLAttributes<HTMLDivElement> {
	children: React.ReactNode;
}

export function BrandContextMenu({ children, ...rest }: BrandContextMenuProps) {
	const navigate = useNavigate();
	const { notify } = useToast();
	const [open, setOpen] = React.useState(false);
	const [coords, setCoords] = React.useState<{ x: number; y: number }>({
		x: 0,
		y: 0,
	});
	const virtualTriggerRef = React.useRef<HTMLSpanElement>(null);

	const onContextMenu = (e: React.MouseEvent) => {
		e.preventDefault();
		setCoords({ x: e.clientX, y: e.clientY });
		setOpen(true);
	};

	const copyText = async (text: string) => {
		try {
			await copyTextToClipboard(text);
			notify(
				<div>
					<div className="font-medium">Copied to clipboard</div>
					<div className="text-gray-500 dark:text-gray-400 text-xs">
						SVG markup is now in your clipboard
					</div>
				</div>,
			);
		} catch (err) {
			console.error('Clipboard error', err);
			notify(
				<div>
					<div className="font-medium">Copy failed</div>
					<div className="text-gray-500 dark:text-gray-400 text-xs">
						Try again or download directly from the brand guide
					</div>
				</div>,
			);
		}
	};

	return (
		<div onContextMenu={onContextMenu} {...rest}>
			{children}
			<Dropdown open={open} onOpenChange={setOpen} modal>
				<DropdownTrigger asChild={false}>
					<span
						ref={virtualTriggerRef}
						style={{
							position: 'fixed',
							left: coords.x,
							top: coords.y,
							width: 1,
							height: 1,
						}}
					/>
				</DropdownTrigger>
				<DropdownContent
					sideOffset={4}
					align="start"
					className="dark:bg-gray-900/50 backdrop-blur-md"
				>
					{[
						{
							label: 'Logo as SVG (Black)',
							url: '/images/logos/logo-black.svg',
						},
						{
							label: 'Logo as SVG (White)',
							url: '/images/logos/logo-white.svg',
							darkBg: true,
						},
						{
							label: 'Wordmark as SVG (Black)',
							url: '/images/logos/logo-word-black.svg',
						},
						{
							label: 'Wordmark as SVG (White)',
							url: '/images/logos/logo-word-white.svg',
							darkBg: true,
						},
					].map(({ label, url, darkBg }) => (
						<DropdownItem
							key={label}
							className="py-1"
							onSelect={async () => {
								try {
									const res = await fetch(url);
									const text = await res.text();
									await copyText(text);
								} catch (err) {
									console.error('Failed to copy logo', err);
								}
							}}
						>
							{label}
							<div
								className={twMerge(
									'p-1 rounded-full',
									darkBg ? 'bg-black text-white shadow-md' : 'bg-white text-black shadow-md',
								)}
							>
								<img src={url} alt={label} className="h-6" />
							</div>
						</DropdownItem>
					))}
					<DropdownSeparator />
					<DropdownItem onSelect={() => navigate({ to: '/brand-guide' })}>
						Brand Guide & All Assets
					</DropdownItem>
				</DropdownContent>
			</Dropdown>
		</div>
	);
}
