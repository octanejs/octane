// Re-export all entities - this module handles HMR
export { Sky } from './Sky';
export { Ocean } from './Ocean';
export { Boat } from './Boat';
export { Coins } from './Coins';
export { Islands } from './Islands';
export { OceanRocks } from './OceanRocks';
export { BoundaryWalls } from './BoundaryWalls';
export { AIShips } from './AIShips';
export { Cannonballs } from './Cannonballs';

// HMR - bubble up to parent
if (import.meta.hot) {
	import.meta.hot.accept();
}
