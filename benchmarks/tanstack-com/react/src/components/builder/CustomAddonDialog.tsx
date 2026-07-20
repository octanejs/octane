/**
 * Custom Integration Dialog
 *
 * Allows importing integrations from external URLs.
 */

import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { twMerge } from 'tailwind-merge';
import { Plus, Loader2, AlertCircle, X, ExternalLink, HelpCircle } from 'lucide-react';
import { useBuilderStore, useTailwind } from './store';
import type { IntegrationCompiled } from '~/builder/api';

interface CustomAddonDialogProps {
	onClose?: () => void;
}

export function CustomAddonDialog({ onClose }: CustomAddonDialogProps) {
	const [url, setUrl] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [preview, setPreview] = useState<IntegrationCompiled | null>(null);

	const addCustomIntegration = useBuilderStore((s) => s.addCustomIntegration);
	const tailwind = useTailwind();

	const handleLoad = async () => {
		if (!url.trim()) {
			setError('Please enter a URL');
			return;
		}

		setIsLoading(true);
		setError(null);
		setPreview(null);

		try {
			const response = await fetch(`/api/builder/load-remote-addon?url=${encodeURIComponent(url)}`);
			const data = await response.json();

			if (data.error) {
				setError(data.error);
			} else if (data.integration) {
				setPreview(data.integration);
			}
		} catch {
			setError('Failed to load integration');
		} finally {
			setIsLoading(false);
		}
	};

	const handleAdd = () => {
		if (!preview) return;

		// Check Tailwind requirement
		if (preview.requiresTailwind && !tailwind) {
			setError('This integration requires Tailwind CSS. Enable Tailwind first.');
			return;
		}

		addCustomIntegration(preview);
		onClose?.();
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter' && !isLoading) {
			if (preview) {
				handleAdd();
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
					htmlFor="custom-addon-url"
					className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
				>
					Integration URL
				</label>
				<div className="flex gap-2">
					<input
						id="custom-addon-url"
						type="url"
						value={url}
						onChange={(e) => {
							setUrl(e.target.value);
							setError(null);
							setPreview(null);
						}}
						onKeyDown={handleKeyDown}
						placeholder="https://example.com/my-integration.json"
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
					Enter the URL to an integration JSON file (e.g., from GitHub raw content)
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
					<div className="flex items-start justify-between gap-3">
						<div>
							<h3 className="font-medium text-gray-900 dark:text-gray-100">{preview.name}</h3>
							<p className="text-sm text-gray-500 dark:text-gray-400">{preview.description}</p>
						</div>
						{preview.link && (
							<a
								href={preview.link}
								target="_blank"
								rel="noopener noreferrer"
								className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
							>
								<ExternalLink className="w-4 h-4" />
							</a>
						)}
					</div>

					{/* Metadata */}
					<div className="flex flex-wrap gap-2 text-xs">
						{preview.author && (
							<span className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">
								By {preview.author}
							</span>
						)}
						{preview.version && (
							<span className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">
								v{preview.version}
							</span>
						)}
						{preview.category && (
							<span className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">
								{preview.category}
							</span>
						)}
						{preview.requiresTailwind && (
							<span className="px-2 py-1 bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 rounded">
								Requires Tailwind
							</span>
						)}
					</div>

					{/* Files count */}
					<div className="text-xs text-gray-500 dark:text-gray-400">
						{Object.keys(preview.files).length} files included
					</div>

					{/* Add button */}
					<button
						onClick={handleAdd}
						className="w-full px-4 py-2 text-sm font-medium bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
					>
						Add to Project
					</button>
				</div>
			)}
		</div>
	);
}

/**
 * Button to open custom integration dialog in a modal-like expandable section
 */
export function CustomAddonButton() {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<div className="border-t border-gray-200 dark:border-gray-700 pt-2 mt-2">
			<button
				onClick={() => setIsOpen(!isOpen)}
				className={twMerge(
					'w-full flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg border border-dashed transition-colors',
					isOpen
						? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400'
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
						<Plus className="w-4 h-4" />
						Custom Integration
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
					<CustomAddonDialog onClose={() => setIsOpen(false)} />
				</div>
			)}
		</div>
	);
}
