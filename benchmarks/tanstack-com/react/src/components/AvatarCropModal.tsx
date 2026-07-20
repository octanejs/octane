import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';
import { X } from 'lucide-react';
import { Button } from '~/ui';

interface AvatarCropModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	imageSrc: string;
	onCropComplete: (croppedBlob: Blob) => void;
}

async function getCroppedImg(
	imageSrc: string,
	pixelCrop: Area,
	outputSize: number = 256,
): Promise<Blob> {
	const image = new Image();
	image.crossOrigin = 'anonymous';

	await new Promise<void>((resolve, reject) => {
		image.onload = () => resolve();
		image.onerror = reject;
		image.src = imageSrc;
	});

	const canvas = document.createElement('canvas');
	canvas.width = outputSize;
	canvas.height = outputSize;
	const ctx = canvas.getContext('2d');

	if (!ctx) {
		throw new Error('Could not get canvas context');
	}

	ctx.drawImage(
		image,
		pixelCrop.x,
		pixelCrop.y,
		pixelCrop.width,
		pixelCrop.height,
		0,
		0,
		outputSize,
		outputSize,
	);

	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (blob) {
					resolve(blob);
				} else {
					reject(new Error('Could not create blob'));
				}
			},
			'image/jpeg',
			0.9,
		);
	});
}

export function AvatarCropModal({
	open,
	onOpenChange,
	imageSrc,
	onCropComplete,
}: AvatarCropModalProps) {
	const [crop, setCrop] = React.useState<Point>({ x: 0, y: 0 });
	const [zoom, setZoom] = React.useState(1);
	const [croppedAreaPixels, setCroppedAreaPixels] = React.useState<Area | null>(null);
	const [isProcessing, setIsProcessing] = React.useState(false);

	const handleCropComplete = React.useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
		setCroppedAreaPixels(croppedAreaPixels);
	}, []);

	const handleSave = React.useCallback(async () => {
		if (!croppedAreaPixels) return;

		setIsProcessing(true);
		try {
			const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
			onCropComplete(croppedBlob);
			onOpenChange(false);
		} catch (error) {
			console.error('Error cropping image:', error);
		} finally {
			setIsProcessing(false);
		}
	}, [imageSrc, croppedAreaPixels, onCropComplete, onOpenChange]);

	// Reset state when modal opens
	React.useEffect(() => {
		if (open) {
			setCrop({ x: 0, y: 0 });
			setZoom(1);
			setCroppedAreaPixels(null);
		}
	}, [open]);

	return (
		<DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
			<DialogPrimitive.Portal>
				<DialogPrimitive.Overlay className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-sm" />
				<DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[1000] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white dark:bg-gray-900 p-6 shadow-xl">
					<div className="flex items-center justify-between mb-4">
						<DialogPrimitive.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
							Crop Profile Picture
						</DialogPrimitive.Title>
						<DialogPrimitive.Close className="rounded-full p-1 hover:bg-gray-100 dark:hover:bg-gray-800">
							<X className="w-5 h-5 text-gray-500" />
						</DialogPrimitive.Close>
					</div>

					<div className="relative w-full aspect-square bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
						<Cropper
							image={imageSrc}
							crop={crop}
							zoom={zoom}
							aspect={1}
							cropShape="round"
							showGrid={false}
							onCropChange={setCrop}
							onZoomChange={setZoom}
							onCropComplete={handleCropComplete}
						/>
					</div>

					<div className="mt-4">
						<label
							htmlFor="zoom"
							className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
						>
							Zoom
						</label>
						<input
							id="zoom"
							type="range"
							min={1}
							max={3}
							step={0.1}
							value={zoom}
							onChange={(e) => setZoom(Number(e.target.value))}
							className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
						/>
					</div>

					<div className="mt-6 flex gap-3 justify-end">
						<Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button size="sm" onClick={handleSave} disabled={isProcessing || !croppedAreaPixels}>
							{isProcessing ? 'Processing...' : 'Save'}
						</Button>
					</div>
				</DialogPrimitive.Content>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	);
}
