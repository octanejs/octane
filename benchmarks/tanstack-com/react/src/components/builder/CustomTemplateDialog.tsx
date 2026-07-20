/**
 * Custom Template Dialog
 *
 * Allows importing project templates from external URLs.
 */

import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { twMerge } from 'tailwind-merge';
import { Loader2, AlertCircle, Link as LinkIcon, X, HelpCircle } from 'lucide-react';
import { useBuilderStore, useCustomTemplate } from './store';
import type { CustomTemplateCompiled } from '~/builder/api';

interface CustomTemplateDialogProps {
	onClose?: () => void;
}

export function CustomTemplateDialog({ onClose }: CustomTemplateDialogProps) {
	const [url, setUrl] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [preview, setPreview] = useState<CustomTemplateCompiled | null>(null);

	const setCustomTemplate = useBuilderStore((s) => s.setCustomTemplate);

	const handleLoad = async () => {
		if (!url.trim()) {
			setError('Please enter a URL');
			return;
		}

		setIsLoading(true);
		setError(null);
		setPreview(null);

		try {
			const response = await fetch(
				`/api/builder/load-remote-template?url=${encodeURIComponent(url)}`,
			);
			const data = await response.json();

			if (data.error) {
				setError(data.error);
			} else if (data.template) {
				setPreview(data.template);
			}
		} catch {
			setError('Failed to load template');
		} finally {
			setIsLoading(false);
		}
	};

	const handleApply = () => {
		if (!preview) return;
		setCustomTemplate(preview);
		onClose?.();
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter' && !isLoading) {
			if (preview) {
				handleApply();
			} else {
				handleLoad();
			}
		}
	};

	return (
		<div className="space-y-4">
			{/* URL Input */}
			<div>
				<label
					htmlFor="custom-template-url"
					className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
				>
					Template URL
				</label>
				<div className="flex gap-2">
					<input
						id="custom-template-url"
						type="url"
						value={url}
						onChange={(e) => {
							setUrl(e.target.value);
							setError(null);
							setPreview(null);
						}}
						onKeyDown={handleKeyDown}
						placeholder="https://example.com/my-template.json"
						className="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
						disabled={isLoading}
					/>
					<button
						onClick={handleLoad}
						disabled={isLoading || !url.trim()}
						className={twMerge(
							'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
							isLoading || !url.trim()
								? 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
								: 'bg-cyan-500 text-white hover:bg-cyan-600',
						)}
					>
						{isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Load'}
					</button>
				</div>
				<p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
					Enter the URL to a template JSON file
				</p>
			</div>

			{/* Error */}
			{error && (
				<div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
					<AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
					<span>{error}</span>
				</div>
			)}

			{/* Preview */}
			{preview && (
				<div className="p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg space-y-3">
					<div>
						<h3 className="font-medium text-gray-900 dark:text-gray-100">{preview.name}</h3>
						<p className="text-sm text-gray-500 dark:text-gray-400">{preview.description}</p>
					</div>

					{/* Metadata */}
					<div className="flex flex-wrap gap-2 text-xs">
						{preview.tailwind && (
							<span className="px-2 py-1 bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 rounded">
								Tailwind
							</span>
						)}
						{preview.typescript && (
							<span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
								TypeScript
							</span>
						)}
						{preview.dependsOn && preview.dependsOn.length > 0 && (
							<span className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">
								{preview.dependsOn.length} add-ons
							</span>
						)}
					</div>

					{/* Apply button */}
					<button
						onClick={handleApply}
						className="w-full px-4 py-2 text-sm font-medium bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
					>
						Use This Template
					</button>
				</div>
			)}
		</div>
	);
}

/**
 * Display and manage custom template selection
 */
export function CustomTemplateSection() {
	const [isOpen, setIsOpen] = useState(false);
	const customTemplate = useCustomTemplate();
	const setCustomTemplate = useBuilderStore((s) => s.setCustomTemplate);

	if (customTemplate) {
		return (
			<div className="p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
				<div className="flex items-center justify-between gap-3">
					<div className="flex items-center gap-2">
						<LinkIcon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
						<div>
							<span className="text-sm font-medium text-gray-900 dark:text-gray-100">
								{customTemplate.name}
							</span>
							<span className="block text-xs text-gray-500 dark:text-gray-400">
								Custom Template
							</span>
						</div>
					</div>
					<button
						onClick={() => setCustomTemplate(null)}
						className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
					>
						<X className="w-4 h-4" />
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="border-t border-gray-200 dark:border-gray-700 pt-2 mt-2">
			<button
				onClick={() => setIsOpen(!isOpen)}
				className={twMerge(
					'w-full flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg border border-dashed transition-colors',
					isOpen
						? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400'
						: 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500',
				)}
			>
				{isOpen ? (
					<>
						<X className="w-4 h-4" />
						Cancel
					</>
				) : (
					<>
						<LinkIcon className="w-4 h-4" />
						Custom Template
						<Link
							to="/builder/docs"
							onClick={(e) => e.stopPropagation()}
							className="p-0.5 hover:text-blue-600 dark:hover:text-cyan-400"
						>
							<HelpCircle className="w-3.5 h-3.5" />
						</Link>
					</>
				)}
			</button>

			{isOpen && (
				<div className="mt-3 p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg">
					<CustomTemplateDialog onClose={() => setIsOpen(false)} />
				</div>
			)}
		</div>
	);
}

/**
 * Custom template item for use in template grid
 */
export function CustomTemplateItem({
	isExpanded,
	onToggle,
}: {
	isExpanded: boolean;
	onToggle: () => void;
}) {
	const customTemplate = useCustomTemplate();
	const setCustomTemplate = useBuilderStore((s) => s.setCustomTemplate);

	if (customTemplate) {
		return (
			<div className="col-span-full">
				<div className="p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
					<div className="flex items-center justify-between gap-3">
						<div className="flex items-center gap-2">
							<div className="w-8 h-8 rounded-lg flex items-center justify-center bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400">
								<LinkIcon className="w-4 h-4" />
							</div>
							<div>
								<span className="text-sm font-medium text-gray-900 dark:text-gray-100">
									{customTemplate.name}
								</span>
								<span className="block text-xs text-gray-500 dark:text-gray-400">
									Custom Template
								</span>
							</div>
						</div>
						<button
							onClick={() => setCustomTemplate(null)}
							className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
						>
							<X className="w-4 h-4" />
						</button>
					</div>
				</div>
			</div>
		);
	}

	return (
		<>
			<button
				onClick={onToggle}
				className={twMerge(
					'p-3 rounded-lg border text-left transition-all flex items-start gap-2 border-dashed',
					isExpanded
						? 'bg-purple-50 dark:bg-purple-900/20 border-purple-500 dark:border-purple-500'
						: 'bg-white dark:bg-gray-800/50 border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800',
				)}
			>
				<div
					className={twMerge(
						'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
						isExpanded
							? 'bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400'
							: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
					)}
				>
					<LinkIcon className="w-4 h-4" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<span
							className={twMerge(
								'font-medium text-sm',
								isExpanded
									? 'text-purple-700 dark:text-purple-300'
									: 'text-gray-900 dark:text-gray-100',
							)}
						>
							Custom Template
						</span>
						<Link
							to="/builder/docs"
							onClick={(e) => e.stopPropagation()}
							className="p-0.5 text-gray-400 hover:text-blue-600 dark:hover:text-cyan-400"
						>
							<HelpCircle className="w-3.5 h-3.5" />
						</Link>
					</div>
					<div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
						Import from URL
					</div>
				</div>
			</button>
			{isExpanded && (
				<div className="col-span-full p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg">
					<CustomTemplateDialog onClose={onToggle} />
				</div>
			)}
		</>
	);
}
