/** @jsxImportSource octane */
import { useState } from '../../react-shim.js';
import { PointerSensor } from '@octanejs/dnd-kit';
import { PointerActivationConstraints } from '@dnd-kit/dom';
import { isElement } from '@dnd-kit/dom/utilities';
import { type Distance } from '@dnd-kit/geometry';

export interface DelayConstraint {
	value: number;
	tolerance: Distance;
}

export interface DistanceConstraint {
	value: number;
	tolerance?: Distance;
}

export interface ActivationConstraints {
	distance?: DistanceConstraint;
	delay?: DelayConstraint;
}

// @dnd-kit 0.4 replaced the `{ delay, distance }` options object with a list
// of constraint instances, and its activation controller iterates whatever the
// sensor returns. Build fresh instances per activation: each one holds the
// state of a single pointer interaction.
function toPointerConstraints(constraints: ActivationConstraints | undefined) {
	if (!constraints) return undefined;

	const list = [];

	if (constraints.delay) {
		list.push(new PointerActivationConstraints.Delay(constraints.delay));
	}

	if (constraints.distance) {
		list.push(new PointerActivationConstraints.Distance(constraints.distance));
	}

	return list;
}

const touchDefault = { delay: { value: 200, tolerance: 10 } };
const otherDefault = {
	delay: { value: 200, tolerance: 10 },
	distance: { value: 5 },
};

export const useSensors = (
	{
		other = otherDefault,
		mouse,
		touch = touchDefault,
	}: {
		mouse?: ActivationConstraints;
		touch?: ActivationConstraints;
		other?: ActivationConstraints;
	} = {
		touch: touchDefault,
		other: otherDefault,
	},
) => {
	const [sensors] = useState(() => [
		PointerSensor.configure({
			activationConstraints(event, source) {
				const { pointerType, target } = event;

				if (
					pointerType === 'mouse' &&
					isElement(target) &&
					(source.handle === target || source.handle?.contains(target))
				) {
					return toPointerConstraints(mouse);
				}

				if (pointerType === 'touch') {
					return toPointerConstraints(touch);
				}

				return toPointerConstraints(other);
			},
		}),
	]);

	return sensors;
};
