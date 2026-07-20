import * as React from 'react';
import { useUploadThing } from '~/utils/uploadthing.client';
import { useToast } from './ToastProvider';
import { Upload, X, Loader2 } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { SHOWCASE_IMAGE_MAX_BYTES, validateImageUploadFile } from '~/utils/upload-preflight';

export interface ImageUploadProps {
	value?: string;
	onChange: (url: string | undefined) => void;
	label: string;
	hint?: string;
	required?: boolean;
	aspectRatio?: 'video' | 'square';
	size?: 'default' | 'small';
	className?: string;
}

export function ImageUploadClient({
	value,
	onChange,
	label,
	hint,
	required,
	aspectRatio = 'video',
	size = 'default',
	className,
}: ImageUploadProps) {
	const { notify } = useToast();
	const [isUploading, setIsUploading] = React.useState(false);
	const [dragOver, setDragOver] = React.useState(false);
	const fileInputRef = React.useRef<HTMLInputElement>(null);

	const { startUpload } = useUploadThing('showcaseUploader', {
		onClientUploadComplete: (res) => {
			setIsUploading(false);
			if (res?.[0]?.ufsUrl) {
				onChange(res[0].ufsUrl);
			}
		},
		onUploadError: (error) => {
			setIsUploading(false);
			notify(
				<div>
					<div className="font-medium">Upload failed</div>
					<div className="text-gray-500 dark:text-gray-400 text-xs">{error.message}</div>
				</div>,
			);
		},
	});

	const handleFileSelect = async (file: File) => {
		const validationError = validateImageUploadFile(file, SHOWCASE_IMAGE_MAX_BYTES);

		if (validationError) {
			notify(
				<div>
					<div className="font-medium">Invalid file type</div>
					<div className="text-gray-500 dark:text-gray-400 text-xs">{validationError}</div>
				</div>,
			);
			return;
		}

		setIsUploading(true);
		await startUpload([file]);
	};

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			handleFileSelect(file);
		}
		e.target.value = '';
	};

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault();
		setDragOver(false);
		const file = e.dataTransfer.files?.[0];
		if (file) {
			handleFileSelect(file);
		}
	};

	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault();
		setDragOver(true);
	};

	const handleDragLeave = () => {
		setDragOver(false);
	};

	const handleRemove = () => {
		onChange(undefined);
	};

	const isSmall = size === 'small';
	const aspectClass = aspectRatio === 'video' ? 'aspect-video' : 'aspect-square';
	const sizeClass = isSmall ? 'w-24' : aspectRatio === 'video' ? 'max-w-md' : 'w-40';

	return (
		<div className={className}>
			<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
				{label} {required && '*'}
			</label>

			{value ? (
				<div className={twMerge('relative', sizeClass)}>
					<div
						className={twMerge(
							'relative overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900',
							aspectClass,
						)}
					>
						<img src={value} alt="Uploaded" className="w-full h-full object-cover" />
					</div>
					<button
						type="button"
						onClick={handleRemove}
						className={twMerge(
							'absolute bg-red-600 hover:bg-red-700 text-white rounded-full transition-colors',
							isSmall ? 'top-1 right-1 p-1' : 'top-2 right-2 p-1.5',
						)}
						title="Remove image"
					>
						<X className={isSmall ? 'w-3 h-3' : 'w-4 h-4'} />
					</button>
				</div>
			) : (
				// eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
				<div
					onClick={() => fileInputRef.current?.click()}
					onDrop={handleDrop}
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					className={twMerge(
						'relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed cursor-pointer transition-colors',
						aspectClass,
						sizeClass,
						dragOver
							? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
							: 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 bg-gray-50 dark:bg-gray-800/50',
						isUploading && 'pointer-events-none opacity-60',
					)}
				>
					{isUploading ? (
						<div className="p-4 text-center">
							<Loader2
								className={twMerge(
									'text-blue-500 animate-spin mx-auto',
									isSmall ? 'w-5 h-5' : 'w-8 h-8',
								)}
							/>
							{!isSmall && (
								<span className="mt-2 block text-sm text-gray-600 dark:text-gray-400">
									Uploading...
								</span>
							)}
						</div>
					) : (
						<div className="p-4 text-center">
							<Upload
								className={twMerge('text-gray-400 mx-auto', isSmall ? 'w-5 h-5' : 'w-8 h-8')}
							/>
							{!isSmall && (
								<>
									<span className="mt-2 block text-sm text-gray-600 dark:text-gray-400">
										Click or drag to upload
									</span>
									<span className="mt-1 block text-xs text-gray-500">PNG, JPG up to 4MB</span>
								</>
							)}
						</div>
					)}
				</div>
			)}

			<input
				ref={fileInputRef}
				type="file"
				accept="image/png,image/jpeg,image/webp,image/gif"
				onChange={handleInputChange}
				className="hidden"
			/>

			{hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
		</div>
	);
}
