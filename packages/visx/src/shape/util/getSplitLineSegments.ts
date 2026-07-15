interface PointInSegment {
	x: number | undefined;
	y: number | undefined;
}

/** Different algorithms to segment the line */
export type LineSegmentation = 'x' | 'y' | 'length';

type LineSegments = { x: number; y: number }[][];

export interface GetLineSegmentsConfig {
	/** Full path `d` attribute to be broken up into `n` segments. */
	path: string;
	/** Array of length `n`, where `n` is the number of segments. */
	pointsInSegments: PointInSegment[][];
	/**
	 * How to segment the line
	 * - `x`: Split based on x-position,
	 *  assuming x values increase only (`segment[i].x > segment[i-1].x`)
	 *  or decrease only (`segment[i].x < segment[i-1].x`).
	 * - `y`: Split based on y-position,
	 *  assuming y values increase only (`segment[i].y > segment[i-1].y`)
	 *  or decrease only (`segment[i].y < segment[i-1].y`).
	 * - `length`: Assuming the path length between consecutive points are equal.
	 *
	 * Default is `x`.
	 */
	segmentation: LineSegmentation;
	/**
	 * The `path` will be sampled every `sampleRate` pixel to generate the returned points.
	 * Default is `1` pixel.
	 */
	sampleRate?: number;
}

export default function getSplitLineSegments({
	path,
	pointsInSegments,
	segmentation = 'x',
	sampleRate = 1,
}: GetLineSegmentsConfig): LineSegments {
	if (pointsInSegments.length === 0 || path.length === 0) return [];

	const properties = new svgPathProperties(path);
	const totalLength = properties.getTotalLength();
	const interval = Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : 1;
	const lineSegments: LineSegments = pointsInSegments.map(() => []);
	const numSegments = pointsInSegments.length;

	if (segmentation === 'x' || segmentation === 'y') {
		const segmentStarts = pointsInSegments.map(
			(points) => points.find((point) => typeof point[segmentation] === 'number')?.[segmentation],
		);
		const first = properties.getPointAtLength(0);
		const last = properties.getPointAtLength(totalLength);
		const isIncreasing = last[segmentation] > first[segmentation];
		let currentSegment = 0;

		for (let distance = 0; distance <= totalLength; distance += interval) {
			const sample = properties.getPointAtLength(distance);
			while (currentSegment < numSegments - 1) {
				const nextStart = segmentStarts[currentSegment + 1];
				if (nextStart == null) {
					currentSegment += 1;
					continue;
				}
				const beyond = isIncreasing
					? sample[segmentation] >= nextStart
					: sample[segmentation] <= nextStart;
				if (!beyond) break;
				currentSegment += 1;
			}
			lineSegments[currentSegment].push({ x: sample.x, y: sample.y });
		}
	} else {
		const pointCounts = pointsInSegments.map((points) => points.length);
		const pointCount = pointCounts.reduce((sum, count) => sum + count, 0);
		const lengthBetweenPoints = totalLength / Math.max(1, pointCount - 1);
		const segmentStarts = pointCounts.slice(0, numSegments - 1);
		segmentStarts.unshift(0);
		for (let index = 2; index < numSegments; index += 1) {
			segmentStarts[index] += segmentStarts[index - 1];
		}
		for (let index = 0; index < numSegments; index += 1) {
			segmentStarts[index] *= lengthBetweenPoints;
		}

		let currentSegment = 0;
		for (let distance = 0; distance <= totalLength; distance += interval) {
			const sample = properties.getPointAtLength(distance);
			while (currentSegment < numSegments - 1 && distance >= segmentStarts[currentSegment + 1]) {
				currentSegment += 1;
			}
			lineSegments[currentSegment].push({ x: sample.x, y: sample.y });
		}
	}

	return lineSegments;
}
import { svgPathProperties } from 'svg-path-properties';
