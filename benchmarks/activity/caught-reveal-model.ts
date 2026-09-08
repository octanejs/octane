import type { Mode } from './model';
import { ensure } from './model';

export class CaughtRevealError extends Error {
	constructor(readonly index: number) {
		super(`caught-reveal-${index}`);
	}
}

export class CaughtRevealModel {
	private caughtErrors: readonly CaughtRevealError[] | null = null;
	reports = 0;
	checksum = 0;

	constructor(readonly count: number) {}

	get errors(): readonly CaughtRevealError[] {
		return (this.caughtErrors ??= Array.from(
			{ length: this.count },
			(_, index) => new CaughtRevealError(index),
		));
	}

	report(error: unknown): void {
		ensure(error instanceof CaughtRevealError, 'Caught reveal reported an unknown error');
		ensure(
			error.index === this.reports,
			`Caught reveal report ${this.reports} arrived from ${error.index}`,
		);
		this.reports++;
		this.checksum += error.index + 1;
	}

	assertReports(expected: number): void {
		ensure(this.reports === expected, `Caught reveal reported ${this.reports}/${expected}`);
		const checksum = (expected * (expected + 1)) / 2;
		ensure(this.checksum === checksum, `Caught reveal checksum ${this.checksum} != ${checksum}`);
	}
}

export type CaughtRevealProps = {
	indices: readonly number[];
	errors: readonly Error[] | null;
	mode: Mode;
};

export type CaughtRevealRenderer = {
	render: (props: CaughtRevealProps) => void;
	unmount: () => void;
};
