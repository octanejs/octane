/** @jsxImportSource @octanejs/three/intrinsics */
import { useFrame } from '@octanejs/three';
import { useCallback, useMemo } from '@octanejs/three/renderer';
import { Texture } from 'three';
import { slotDefault } from './compiler-slot.js';
import { resolveRenderChildren, type RenderChildren } from './octane-children.js';

type Point = { x: number; y: number; age: number; force: number };

type TrailConfig = {
	size?: number;
	maxAge?: number;
	radius?: number;
	intensity?: number;
	interpolate?: number;
	smoothing?: number;
	minForce?: number;
	blend?: CanvasRenderingContext2D['globalCompositeOperation'];
	ease?: (value: number) => number;
};

const smoothAverage = (current: number, measurement: number, smoothing = 0.9) =>
	measurement * smoothing + current * (1 - smoothing);
const easeCircleOut = (value: number) => Math.sqrt(1 - Math.pow(value - 1, 2));

class TrailTextureImpl {
	trail: Point[] = [];
	canvas!: HTMLCanvasElement;
	ctx!: CanvasRenderingContext2D;
	texture!: Texture;
	force = 0;
	size: number;
	maxAge: number;
	radius: number;
	intensity: number;
	ease: (value: number) => number;
	minForce: number;
	interpolate: number;
	smoothing: number;
	blend: CanvasRenderingContext2D['globalCompositeOperation'];

	constructor({
		size = 256,
		maxAge = 750,
		radius = 0.3,
		intensity = 0.2,
		interpolate = 0,
		smoothing = 0,
		minForce = 0.3,
		blend = 'screen',
		ease = easeCircleOut,
	}: TrailConfig = {}) {
		this.size = size;
		this.maxAge = maxAge;
		this.radius = radius;
		this.intensity = intensity;
		this.ease = ease;
		this.interpolate = interpolate;
		this.smoothing = smoothing;
		this.minForce = minForce;
		this.blend = blend;
		this.initTexture();
	}

	initTexture(): void {
		this.canvas = document.createElement('canvas');
		this.canvas.width = this.canvas.height = this.size;
		const context = this.canvas.getContext('2d');
		if (context === null) throw new Error('2D not available');
		this.ctx = context;
		this.ctx.fillStyle = 'black';
		this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
		this.texture = new Texture(this.canvas);
		this.canvas.id = 'touchTexture';
		this.canvas.style.width = this.canvas.style.height = `${this.canvas.width}px`;
	}

	update(delta: number): void {
		this.clear();
		this.trail.forEach((point, index) => {
			point.age += delta * 1000;
			if (point.age > this.maxAge) this.trail.splice(index, 1);
		});
		if (!this.trail.length) this.force = 0;
		this.trail.forEach((point) => this.drawTouch(point));
		this.texture.needsUpdate = true;
	}

	clear(): void {
		this.ctx.globalCompositeOperation = 'source-over';
		this.ctx.fillStyle = 'black';
		this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
	}

	addTouch(point: { x: number; y: number }): void {
		const last = this.trail[this.trail.length - 1];
		if (last) {
			const dx = last.x - point.x;
			const dy = last.y - point.y;
			const distance = dx * dx + dy * dy;
			const force = Math.max(this.minForce, Math.min(distance * 10_000, 1));
			this.force = smoothAverage(force, this.force, this.smoothing);
			if (this.interpolate) {
				const lines = Math.ceil(distance / Math.pow((this.radius * 0.5) / this.interpolate, 2));
				if (lines > 1) {
					for (let index = 1; index < lines; index++) {
						this.trail.push({
							x: last.x - (dx / lines) * index,
							y: last.y - (dy / lines) * index,
							age: 0,
							force,
						});
					}
				}
			}
		}
		this.trail.push({ x: point.x, y: point.y, age: 0, force: this.force });
	}

	drawTouch(point: Point): void {
		const position = { x: point.x * this.size, y: (1 - point.y) * this.size };
		let intensity = 1;
		if (point.age < this.maxAge * 0.3) {
			intensity = this.ease(point.age / (this.maxAge * 0.3));
		} else {
			intensity = this.ease(1 - (point.age - this.maxAge * 0.3) / (this.maxAge * 0.7));
		}
		intensity *= point.force;
		this.ctx.globalCompositeOperation = this.blend;
		const radius = this.size * this.radius * intensity;
		const gradient = this.ctx.createRadialGradient(
			position.x,
			position.y,
			Math.max(0, radius * 0.25),
			position.x,
			position.y,
			Math.max(0, radius),
		);
		gradient.addColorStop(0, `rgba(255, 255, 255, ${this.intensity})`);
		gradient.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
		this.ctx.beginPath();
		this.ctx.fillStyle = gradient;
		this.ctx.arc(position.x, position.y, Math.max(0, radius), 0, Math.PI * 2);
		this.ctx.fill();
	}
}

export function useTrailTexture(
	config: Partial<TrailConfig> = {},
): [Texture, (event: { uv: { x: number; y: number } }) => void] {
	config = slotDefault(config, {});
	const { size, maxAge, radius, intensity, interpolate, smoothing, minForce, blend, ease } = config;
	const trail = useMemo(
		() => new TrailTextureImpl(config),
		[size, maxAge, radius, intensity, interpolate, smoothing, minForce, blend, ease],
	);
	useFrame((_state, delta) => void trail.update(delta));
	const onMove = useCallback((event: { uv: { x: number; y: number } }) => trail.addTouch(event.uv), [trail]);
	return [trail.texture, onMove];
}

export type TrailTextureProps = {
	children?: RenderChildren<ReturnType<typeof useTrailTexture>>;
} & TrailConfig;

export function TrailTexture({ children, ...config }: TrailTextureProps) @{
	const result = useTrailTexture(config);
	<>
		{resolveRenderChildren(children, result)}
	</>
}
