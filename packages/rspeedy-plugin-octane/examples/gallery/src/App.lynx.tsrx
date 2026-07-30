/** @jsxImportSource @octanejs/lynx/intrinsics */
import { Gallery } from './Gallery.lynx.tsrx';
import { furnituresPictures } from './pictures/furnituresPictures.ts';

export function App() @{
	<Gallery pictureData={furnituresPictures} />
}
