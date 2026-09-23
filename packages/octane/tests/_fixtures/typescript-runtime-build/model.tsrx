// Runtime TypeScript declarations exported across a module boundary. The build
// test imports them from main.tsrx through a real `vite build`.

export enum Direction {
	Up = 1,
	Down,
	Right = Up << 4,
}

export const enum Tone {
	Quiet = 'quiet',
	Loud = `${Quiet}-loud`,
}

export namespace Units {
	export const scale = 10;
	export function format(value: number) {
		return value * scale + suffix;
	}
	const suffix = 'px';
}
