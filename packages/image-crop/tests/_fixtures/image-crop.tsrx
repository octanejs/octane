import { useState } from 'octane';

import ReactCrop, { type Crop, type PercentCrop, type PixelCrop } from '../../src/index.ts';

export interface CropChange {
	pixel: PixelCrop;
	percent: PercentCrop;
}

export interface ImageCropFixtureProps {
	changes: CropChange[];
	initialCrop?: Crop;
}

export function ImageCropFixture(props: ImageCropFixtureProps) {
	const [crop, setCrop] = useState<Crop | undefined>(props.initialCrop);

	function onChange(pixel: PixelCrop, percent: PercentCrop): void {
		props.changes.push({
			pixel: { ...pixel },
			percent: { ...percent },
		});
		setCrop(pixel);
	}

	return <ReactCrop
		circularCrop
		crop={crop}
		onChange={onChange}
		renderSelectionAddon={(state) => <output
			data-testid="selection-state"
			data-active={String(state.cropIsActive)}
			data-drawing={String(state.newCropIsBeingDrawn)}
		>
			selection
		</output>}
		ruleOfThirds
	>
		<img alt="Crop target" src="/target.jpg" />
	</ReactCrop>;
}
