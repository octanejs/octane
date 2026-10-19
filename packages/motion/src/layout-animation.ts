import { animate } from 'motion';
import { getValueTransition } from 'motion-dom';
import {
	projectLayout,
	projectedLayoutBox,
	type LayoutAnimationMode,
	type LayoutBox,
	type LayoutSnapshot,
} from './layout';
import { measureLayout } from './layout-measure';

interface ProjectionAnimation {
	controls: ReturnType<typeof animate> | null;
	value: string;
	priority: string;
	written: string;
}

function changed(a: number, b: number): boolean {
	// Matrix round trips must not turn subpixel rounding into another animation.
	return Math.abs(a - b) > 0.0001;
}

function layoutChanged(
	previous: LayoutBox,
	next: LayoutBox,
	mode: LayoutAnimationMode,
	x: number,
	y: number,
): boolean {
	return (
		(mode !== 'size' &&
			(changed(previous.left + x, next.left) || changed(previous.top + y, next.top))) ||
		(mode !== 'position' &&
			(changed(previous.width, next.width) || changed(previous.height, next.height)))
	);
}

export class LayoutAnimation {
	declare private node: HTMLElement;
	declare private snapshot: LayoutSnapshot | null;
	declare private animation: ProjectionAnimation | null;

	constructor(node: HTMLElement) {
		this.node = node;
		this.snapshot = null;
		this.animation = null;
	}

	private owns(animation: ProjectionAnimation): boolean {
		const style = this.node.style;
		return (
			this.animation === animation &&
			style.transform === animation.written &&
			style.getPropertyPriority('transform') === animation.priority
		);
	}

	stop(): void {
		const animation = this.animation;
		if (!animation) return;
		const owned = this.owns(animation);
		// Invalidate first: stopping a driver may publish its final sampled value.
		this.animation = null;
		animation.controls?.stop();
		if (owned) this.node.style.setProperty('transform', animation.value, animation.priority);
	}

	reset(): void {
		this.stop();
		this.snapshot = null;
	}

	update(
		mode: LayoutAnimationMode | false,
		transition: any,
		reducedMotion: boolean,
		sharedBox?: LayoutBox,
	): void {
		if (mode === false && !this.animation) return;
		if (this.animation && !this.owns(this.animation)) this.stop();
		const animation = this.animation;
		const previous = this.snapshot;
		const next = measureLayout(this.node, animation);
		this.snapshot = next;
		if (reducedMotion) {
			this.stop();
			return;
		}
		const x = previous ? previous.scroll.left - next.scroll.left : 0;
		const y = previous ? previous.scroll.top - next.scroll.top : 0;
		if (
			mode === false ||
			(!sharedBox && (!previous || !layoutChanged(previous.box, next.box, mode, x, y)))
		) {
			if (
				animation &&
				previous &&
				(previous.transform !== next.transform ||
					!previous.basis ||
					!next.basis ||
					changed(previous.basis.a, next.basis.a) ||
					changed(previous.basis.b, next.basis.b) ||
					changed(previous.basis.c, next.basis.c) ||
					changed(previous.basis.d, next.basis.d) ||
					changed(previous.basis.e + x, next.basis.e) ||
					changed(previous.basis.f + y, next.basis.f) ||
					layoutChanged(previous.visual, next.visual, true, x, y))
			)
				this.stop();
			return;
		}

		let from =
			sharedBox ??
			(animation ? projectedLayoutBox(previous!, animation.written) : previous!.visual);
		if (!sharedBox && previous) {
			from = {
				...from,
				left: from.left + x,
				top: from.top + y,
			};
		}
		const projection = projectLayout(from, next, mode);
		this.stop();
		if (!projection) return;

		const style = this.node.style;
		const owner: ProjectionAnimation = {
			controls: null,
			value: style.transform,
			priority: style.getPropertyPriority('transform'),
			written: '',
		};
		this.animation = owner;
		style.setProperty('transform', projection.from, owner.priority);
		owner.written = style.transform;
		const options = getValueTransition(getValueTransition(transition, 'layout'), 'transform');
		// A value driver keeps the authored transform and CSS priority under one
		// owner; DOM animations can keep a hidden transform active during measurement.
		owner.controls = animate(projection.from, projection.to, {
			...options,
			onUpdate: (value: string) => {
				if (!this.owns(owner)) {
					if (this.animation === owner) this.stop();
					return;
				}
				style.setProperty('transform', value, owner.priority);
				owner.written = style.transform;
				options?.onUpdate?.(value);
			},
			onComplete: () => {
				if (this.animation !== owner) return;
				const owned = this.owns(owner);
				this.animation = null;
				if (owned) style.setProperty('transform', owner.value, owner.priority);
				options?.onComplete?.();
			},
		});
	}
}
