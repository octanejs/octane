import * as React from 'react';
import { createPortal } from 'react-dom';
import { HexColorPicker } from 'react-colorful';

export interface ColorPickerPopoverProps {
	packageName: string;
	position: { x: number; y: number };
	currentColor: string;
	onColorChange: (packageName: string, color: string) => void;
	onReset: (packageName: string) => void;
	onClose: () => void;
}

/**
 * A popover component for picking package colors.
 * Shows a hex color picker with Reset and Done buttons.
 */
export function ColorPickerPopover({
	packageName,
	position,
	currentColor,
	onColorChange,
	onReset,
	onClose,
}: ColorPickerPopoverProps) {
	if (typeof document === 'undefined') return null;

	return createPortal(
		<div
			className="fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-2"
			style={{
				left: position.x,
				top: position.y,
			}}
		>
			<div className="flex justify-between items-center mb-2">
				<span className="text-sm font-medium">Pick a color</span>
			</div>
			<HexColorPicker
				color={currentColor}
				onChange={(color: string) => onColorChange(packageName, color)}
			/>
			<div className="flex justify-between mt-2">
				<button
					onClick={() => {
						onReset(packageName);
						onClose();
					}}
					className="px-2 py-1 text-sm text-gray-500 hover:text-red-500"
				>
					Reset
				</button>
				<button onClick={onClose} className="px-2 py-1 text-sm text-blue-500 hover:text-blue-600">
					Done
				</button>
			</div>
		</div>,
		document.body,
	);
}
