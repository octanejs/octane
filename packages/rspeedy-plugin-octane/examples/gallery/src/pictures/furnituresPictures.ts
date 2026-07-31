import pic0 from './0.png';
import pic1 from './1.png';
import pic10 from './10.png';
import pic11 from './11.png';
import pic12 from './12.png';
import pic13 from './13.png';
import pic14 from './14.png';
import pic2 from './2.png';
import pic3 from './3.png';
import pic4 from './4.png';
import pic5 from './5.png';
import pic6 from './6.png';
import pic7 from './7.png';
import pic8 from './8.png';
import pic9 from './9.png';

export interface Picture {
	id: string;
	src: string;
	width: number;
	height: number;
}

const furnituresPicturesSubArray = [
	{ src: pic0, width: 512, height: 429 },
	{ src: pic1, width: 511, height: 437 },
	{ src: pic2, width: 1024, height: 1589 },
	{ src: pic3, width: 510, height: 418 },
	{ src: pic4, width: 509, height: 438 },
	{ src: pic5, width: 1024, height: 1557 },
	{ src: pic6, width: 509, height: 415 },
	{ src: pic7, width: 509, height: 426 },
	{ src: pic8, width: 1024, height: 1544 },
	{ src: pic9, width: 510, height: 432 },
	{ src: pic10, width: 1024, height: 1467 },
	{ src: pic11, width: 1024, height: 1545 },
	{ src: pic12, width: 512, height: 416 },
	{ src: pic13, width: 1024, height: 1509 },
	{ src: pic14, width: 512, height: 411 },
];

export const furnituresPictures: Picture[] = [
	...furnituresPicturesSubArray,
	...furnituresPicturesSubArray,
	...furnituresPicturesSubArray,
	...furnituresPicturesSubArray,
	...furnituresPicturesSubArray,
].map((picture, index) => ({ id: String(index), ...picture }));
