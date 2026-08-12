import type { RefProxy } from 'pdfjs-dist/types/src/display/api.js';

export default class Ref implements RefProxy {
	readonly num: number;
	readonly gen: number;

	constructor({ num, gen }: RefProxy) {
		this.num = num;
		this.gen = gen;
	}

	toString(): string {
		return `${this.num}R${this.gen === 0 ? '' : this.gen}`;
	}
}
