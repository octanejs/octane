/**
 * A `mapbox-gl` double for the ported upstream component suite.
 *
 * WHY THIS EXISTS, AND WHAT IT IS NOT
 *
 * @vis.gl/react-mapbox's own component specs (`upstream/test/components/*.spec.jsx`)
 * construct a real `mapbox-gl@3` Map with a live `VITE_MAPBOX_TOKEN` and wait on
 * `isStyleLoaded()` in a puppeteer browser. CI cannot hold a Mapbox account or
 * bill map loads, so those seven files cannot run as pristine evidence here.
 *
 * This double replaces the engine so the ported cases can assert the same
 * observable behavior. It is therefore PORT-AUTHORED evidence, weaker than a
 * pristine upstream run, and it only counts because the differential lane runs
 * the same fixtures against real React with this same double: a double that
 * flattered the Octane binding would have to flatter React identically.
 *
 * Its camera math is upstream's own vendored `mapbox-gl-mock/transform.js`, so
 * view-state behavior is not invented here.
 */
import Transform from './mapbox-gl-mock/transform.js';
import LngLat from './mapbox-gl-mock/lng_lat.js';
import LngLatBounds from './mapbox-gl-mock/lng_lat_bounds.js';

type Listener = (event: any) => void;

class Evented {
	private _listeners = new Map<string, Set<Listener>>();
	private _onceListeners = new Map<string, Set<Listener>>();

	on(type: string, listener: Listener): this {
		let set = this._listeners.get(type);
		if (!set) this._listeners.set(type, (set = new Set()));
		set.add(listener);
		return this;
	}

	once(type: string, listener: Listener): this {
		let set = this._onceListeners.get(type);
		if (!set) this._onceListeners.set(type, (set = new Set()));
		set.add(listener);
		return this;
	}

	off(type: string, listener: Listener): this {
		this._listeners.get(type)?.delete(listener);
		this._onceListeners.get(type)?.delete(listener);
		return this;
	}

	listens(type: string): boolean {
		return Boolean(this._listeners.get(type)?.size || this._onceListeners.get(type)?.size);
	}

	fire(event: string | { type: string }, properties?: object): this {
		const type = typeof event === 'string' ? event : event.type;
		const payload =
			typeof event === 'string'
				? { type, target: this, ...properties }
				: { target: this, ...event };
		for (const listener of [...(this._listeners.get(type) ?? [])]) listener(payload);
		const onceSet = this._onceListeners.get(type);
		if (onceSet) {
			this._onceListeners.set(type, new Set());
			for (const listener of onceSet) listener(payload);
		}
		return this;
	}
}

class Handler {
	enabled = true;
	enable(): void {
		this.enabled = true;
	}
	disable(): void {
		this.enabled = false;
	}
	isEnabled(): boolean {
		return this.enabled;
	}
}

export interface FakeStyleSpec {
	version?: number;
	sources?: Record<string, unknown>;
	layers?: { id: string; source?: string; type?: string }[];
}

const HANDLER_NAMES = [
	'scrollZoom',
	'boxZoom',
	'dragRotate',
	'dragPan',
	'keyboard',
	'doubleClickZoom',
	'touchZoomRotate',
	'touchPitch',
] as const;

class MapImpl extends Evented {
	// Mapbox exposes these as public-ish internals that the binding reaches into.
	style: { _loaded: boolean } = { _loaded: false };
	transform: any = new Transform();
	// Mapbox's renderer holds its own reference to the live transform, and the
	// binding swaps both when it installs its proxy.
	painter: { transform: any } = { transform: null };
	_pendingCamera: any = null;
	_renderTaskQueue = {
		run: (_arg?: number) => {
			const camera = this._pendingCamera;
			if (!camera) return;
			this._pendingCamera = null;
			this.fire('movestart');
			this._applyCamera(camera);
			this.fire('move');
			this.fire('moveend');
		},
	};

	readonly _container: HTMLElement;
	readonly _canvas: HTMLCanvasElement;
	readonly _sources = new Map<string, any>();
	readonly _layers: { id: string; source?: string; type?: string }[] = [];
	readonly _controls: any[] = [];

	removed = false;
	light: unknown;
	fog: unknown;
	terrain: unknown;
	projection: unknown;
	settings: Record<string, unknown> = {};

	scrollZoom = new Handler();
	boxZoom = new Handler();
	dragRotate = new Handler();
	dragPan = new Handler();
	keyboard = new Handler();
	doubleClickZoom = new Handler();
	touchZoomRotate = new Handler();
	touchPitch = new Handler();

	constructor(options: any) {
		super();
		if (options.accessToken === null || options.accessToken === undefined) {
			// Real Mapbox rejects a missing token asynchronously through the error
			// event rather than throwing from the constructor; upstream's
			// "Map#invalid token" case depends on that shape.
			queueMicrotask(() => {
				this.fire('error', {
					error: new Error('An API access token is required to use Mapbox GL'),
				});
			});
		}
		this._container = options.container;
		this._canvas = document.createElement('canvas');
		this._container?.appendChild(this._canvas);

		const center = options.center ?? [0, 0];
		this.transform.center = new LngLat(center[0], center[1]);
		this.transform.zoom = options.zoom ?? 0;
		this.transform.bearing = options.bearing ?? 0;
		this.transform.pitch = options.pitch ?? 0;
		this.transform.width = 640;
		this.transform.height = 480;
		this.painter.transform = this.transform;

		// Style loading is asynchronous in Mapbox, and both Source and Layer are
		// written around the styledata/`style._loaded` handshake, so preserving the
		// asynchrony is the whole point of the double.
		queueMicrotask(() => {
			if (this.removed) return;
			this.style._loaded = true;
			this.fire('styledata');
			this.fire('load');
			this.fire('idle');
		});
	}

	// ── lifecycle / container ────────────────────────────────────────────────
	getCanvas(): HTMLCanvasElement {
		return this._canvas;
	}

	getContainer(): HTMLElement {
		return this._container;
	}

	resize(): this {
		this.fire('resize');
		return this;
	}

	remove(): void {
		this.removed = true;
		this._canvas.remove();
		this.fire('remove');
	}

	_render(_arg?: number): void {}

	// ── camera ──────────────────────────────────────────────────────────────
	isStyleLoaded(): boolean {
		return this.style._loaded;
	}

	isMoving(): boolean {
		return false;
	}

	setPadding(padding: unknown): this {
		this.transform.padding = padding;
		return this;
	}

	_applyCamera(options: any): void {
		if (options.center) {
			this.transform.center = new LngLat(
				Array.isArray(options.center) ? options.center[0] : options.center.lng,
				Array.isArray(options.center) ? options.center[1] : options.center.lat,
			);
		}
		if (options.zoom !== undefined) this.transform.zoom = options.zoom;
		if (options.bearing !== undefined) this.transform.bearing = options.bearing;
		if (options.pitch !== undefined) this.transform.pitch = options.pitch;
		if (options.padding !== undefined) this.transform.padding = options.padding;
	}

	jumpTo(options: any): this {
		this.fire('movestart');
		this._applyCamera(options);
		this.fire('move');
		this.fire('moveend');
		return this;
	}

	/** Real Mapbox animates; the double settles in one render-queue turn so the
	 * controlled/uncontrolled contract is observable without a raf loop. */
	easeTo(options: any): this {
		this._pendingCamera = options;
		this._renderTaskQueue.run(0);
		return this;
	}

	flyTo(options: any): this {
		return this.easeTo(options);
	}

	fitBounds(): this {
		return this;
	}

	project(lngLat: any): { x: number; y: number } {
		return { x: lngLat?.lng ?? 0, y: lngLat?.lat ?? 0 };
	}

	unproject(point: any): LngLat {
		return new LngLat(point?.x ?? 0, point?.y ?? 0);
	}

	queryTerrainElevation(): number {
		return 0;
	}

	queryRenderedFeatures(): unknown[] {
		return [];
	}

	getBounds(): LngLatBounds {
		return new LngLatBounds([-180, -85], [180, 85]);
	}

	// ── style ───────────────────────────────────────────────────────────────
	setStyle(_style: unknown, _options?: unknown): this {
		this.style._loaded = false;
		queueMicrotask(() => {
			if (this.removed) return;
			this.style._loaded = true;
			this.fire('styledata');
		});
		return this;
	}

	getStyle(): FakeStyleSpec {
		return {
			version: 8,
			sources: Object.fromEntries(this._sources),
			layers: [...this._layers],
		};
	}

	setLight(value: unknown): this {
		this.light = value;
		return this;
	}

	setFog(value: unknown): this {
		this.fog = value;
		return this;
	}

	setTerrain(value: unknown): this {
		this.terrain = value;
		return this;
	}

	setProjection(value: unknown): this {
		this.projection = value;
		return this;
	}

	// ── sources and layers ──────────────────────────────────────────────────
	addSource(id: string, source: any): this {
		const record: any = {
			id,
			...source,
			_data: source.data,
			setData(data: unknown) {
				record._data = data;
			},
			updateImage(next: any) {
				record.url = next?.url;
				record.coordinates = next?.coordinates;
			},
			setUrl(url: string) {
				record.url = url;
			},
			setTiles(tiles: string[]) {
				record.tiles = tiles;
			},
			setCoordinates(coordinates: unknown) {
				record.coordinates = coordinates;
			},
		};
		this._sources.set(id, record);
		this.fire('sourcedata');
		return this;
	}

	getSource(id: string): any {
		return this._sources.get(id);
	}

	removeSource(id: string): this {
		this._sources.delete(id);
		return this;
	}

	addLayer(layer: any, beforeId?: string): this {
		const index = beforeId ? this._layers.findIndex((l) => l.id === beforeId) : -1;
		if (index >= 0) this._layers.splice(index, 0, layer);
		else this._layers.push(layer);
		return this;
	}

	getLayer(id: string): any {
		return this._layers.find((layer) => layer.id === id);
	}

	removeLayer(id: string): this {
		const index = this._layers.findIndex((layer) => layer.id === id);
		if (index >= 0) this._layers.splice(index, 1);
		return this;
	}

	moveLayer(id: string, beforeId?: string): this {
		const layer = this.getLayer(id);
		if (!layer) return this;
		this.removeLayer(id);
		this.addLayer(layer, beforeId);
		return this;
	}

	setLayoutProperty(id: string, key: string, value: unknown): this {
		const layer: any = this.getLayer(id);
		if (layer) (layer.layout ??= {})[key] = value;
		return this;
	}

	setPaintProperty(id: string, key: string, value: unknown): this {
		const layer: any = this.getLayer(id);
		if (layer) (layer.paint ??= {})[key] = value;
		return this;
	}

	setFilter(id: string, filter: unknown): this {
		const layer: any = this.getLayer(id);
		if (layer) layer.filter = filter;
		return this;
	}

	setLayerZoomRange(id: string, minzoom?: number, maxzoom?: number): this {
		const layer: any = this.getLayer(id);
		if (layer) {
			layer.minzoom = minzoom;
			layer.maxzoom = maxzoom;
		}
		return this;
	}

	// ── controls ────────────────────────────────────────────────────────────
	addControl(control: any, position?: string): this {
		this._controls.push(control);
		const element = control.onAdd?.(this);
		if (element) {
			element.dataset.position = position ?? 'top-right';
			this._container?.appendChild(element);
		}
		return this;
	}

	removeControl(control: any): this {
		const index = this._controls.indexOf(control);
		if (index >= 0) this._controls.splice(index, 1);
		control.onRemove?.(this);
		return this;
	}

	hasControl(control: any): boolean {
		return this._controls.includes(control);
	}

	// ── camera constraints (settingNames setters) ───────────────────────────
	setMinZoom(v: unknown): this {
		this.settings.minZoom = v;
		return this;
	}
	setMaxZoom(v: unknown): this {
		this.settings.maxZoom = v;
		return this;
	}
	setMinPitch(v: unknown): this {
		this.settings.minPitch = v;
		return this;
	}
	setMaxPitch(v: unknown): this {
		this.settings.maxPitch = v;
		return this;
	}
	getMaxPitch(): unknown {
		return this.settings.maxPitch;
	}
	getMinZoom(): unknown {
		return this.settings.minZoom;
	}
	getMaxZoom(): unknown {
		return this.settings.maxZoom;
	}
	getMinPitch(): unknown {
		return this.settings.minPitch;
	}
	setMaxBounds(v: unknown): this {
		this.settings.maxBounds = v;
		return this;
	}
	setRenderWorldCopies(v: unknown): this {
		this.settings.renderWorldCopies = v;
		return this;
	}

	get handlers(): readonly string[] {
		return HANDLER_NAMES;
	}
}

export class Marker extends Evented {
	private _element: HTMLElement;
	private _lngLat: LngLat = new LngLat(0, 0);
	private _map: MapImpl | null = null;
	private _offset: [number, number] | null = null;
	private _draggable: boolean;
	private _rotation: number;
	private _rotationAlignment: string;
	private _pitchAlignment: string;
	private _popup: unknown = null;

	constructor(options: any = {}) {
		super();
		this._element = options.element ?? defaultMarkerElement();
		this._element.classList.add('mapboxgl-marker');
		if (options.className) {
			for (const name of String(options.className).split(' ').filter(Boolean)) {
				this._element.classList.add(name);
			}
		}
		this._draggable = Boolean(options.draggable);
		this._rotation = options.rotation ?? 0;
		this._rotationAlignment = options.rotationAlignment ?? 'auto';
		this._pitchAlignment = options.pitchAlignment ?? 'auto';
		this._offset = options.offset ?? null;
	}

	getElement(): HTMLElement {
		return this._element;
	}

	setLngLat(lngLat: [number, number]): this {
		this._lngLat = new LngLat(lngLat[0], lngLat[1]);
		return this;
	}

	getLngLat(): LngLat {
		return this._lngLat;
	}

	addTo(map: MapImpl): this {
		this._map = map;
		map.getContainer()?.appendChild(this._element);
		return this;
	}

	remove(): this {
		this._element.remove();
		this._map = null;
		return this;
	}

	setOffset(offset: [number, number]): this {
		this._offset = offset;
		return this;
	}
	getOffset(): [number, number] | null {
		return this._offset;
	}
	setDraggable(value: boolean): this {
		this._draggable = value;
		return this;
	}
	isDraggable(): boolean {
		return this._draggable;
	}
	setRotation(value: number): this {
		this._rotation = value;
		return this;
	}
	getRotation(): number {
		return this._rotation;
	}
	setRotationAlignment(value: string): this {
		this._rotationAlignment = value;
		return this;
	}
	getRotationAlignment(): string {
		return this._rotationAlignment;
	}
	setPitchAlignment(value: string): this {
		this._pitchAlignment = value;
		return this;
	}
	getPitchAlignment(): string {
		return this._pitchAlignment;
	}
	setPopup(popup: unknown): this {
		this._popup = popup;
		return this;
	}
	getPopup(): unknown {
		return this._popup;
	}
	toggleClassName(name: string): boolean {
		return this._element.classList.toggle(name);
	}
}

export class Popup extends Evented {
	options: any;
	_container: HTMLElement;
	private _content: HTMLElement | null = null;
	private _lngLat: LngLat = new LngLat(0, 0);
	private _map: MapImpl | null = null;

	constructor(options: any = {}) {
		super();
		this.options = { ...options };
		this._container = document.createElement('div');
		this._container.className = 'mapboxgl-popup';
		if (options.className) {
			for (const name of String(options.className).split(' ').filter(Boolean)) {
				this._container.classList.add(name);
			}
		}
	}

	getElement(): HTMLElement {
		return this._container;
	}

	setLngLat(lngLat: [number, number]): this {
		this._lngLat = new LngLat(lngLat[0], lngLat[1]);
		return this;
	}

	getLngLat(): LngLat {
		return this._lngLat;
	}

	setDOMContent(content: HTMLElement): this {
		this._content = content;
		this._container.appendChild(content);
		return this;
	}

	addTo(map: MapImpl): this {
		this._map = map;
		map.getContainer()?.appendChild(this._container);
		this.fire('open');
		return this;
	}

	isOpen(): boolean {
		return this._map !== null;
	}

	remove(): this {
		this._container.remove();
		this._map = null;
		this.fire('close');
		return this;
	}

	// Real Mapbox keeps the popup's offset on `options`, which is what the
	// binding diffs against and what the upstream case asserts on.
	setOffset(offset: unknown): this {
		this.options.offset = offset;
		return this;
	}
	getOffset(): unknown {
		return this.options.offset;
	}
	setMaxWidth(value: string): this {
		this.options.maxWidth = value;
		return this;
	}
	toggleClassName(name: string): boolean {
		return this._container.classList.toggle(name);
	}
}

class ControlBase extends Evented {
	_container: HTMLElement;
	options: any;

	constructor(options: any = {}, className = 'mapboxgl-ctrl') {
		super();
		this.options = { ...options };
		this._container = document.createElement('div');
		this._container.className = className;
	}

	onAdd(_map: MapImpl): HTMLElement {
		return this._container;
	}

	onRemove(): void {
		this._container.remove();
	}
}

export class NavigationControl extends ControlBase {
	constructor(options?: any) {
		super(options, 'mapboxgl-ctrl mapboxgl-ctrl-group');
		for (const name of [
			'mapboxgl-ctrl-zoom-in',
			'mapboxgl-ctrl-zoom-out',
			'mapboxgl-ctrl-compass',
		]) {
			const button = document.createElement('button');
			button.className = name;
			this._container.appendChild(button);
		}
	}
}

export class AttributionControl extends ControlBase {
	constructor(options?: any) {
		super(options, 'mapboxgl-ctrl mapboxgl-ctrl-attrib');
	}
}

export class FullscreenControl extends ControlBase {
	_controlContainer: HTMLElement;
	constructor(options?: any) {
		super(options, 'mapboxgl-ctrl mapboxgl-ctrl-group');
		this._controlContainer = this._container;
		const button = document.createElement('button');
		button.className = 'mapboxgl-ctrl-fullscreen';
		this._container.appendChild(button);
	}
}

export class ScaleControl extends ControlBase {
	constructor(options?: any) {
		super(options, 'mapboxgl-ctrl mapboxgl-ctrl-scale');
	}
	setUnit(unit: string): void {
		this.options.unit = unit;
	}
}

export class GeolocateControl extends ControlBase {
	private _setupCalls = 0;

	constructor(options?: any) {
		super(options, 'mapboxgl-ctrl mapboxgl-ctrl-group');
	}

	onAdd(map: MapImpl): HTMLElement {
		this._setupUI({ map });
		return this._container;
	}

	/** Upstream wraps this to make a remount idempotent; the double counts calls
	 * so the ported case can prove the wrapper still guards. */
	_setupUI(_args: unknown): void {
		this._setupCalls++;
		const button = document.createElement('button');
		button.className = 'mapboxgl-ctrl-geolocate';
		this._container.appendChild(button);
	}

	get setupCalls(): number {
		return this._setupCalls;
	}
}

let rtlTextPluginStatus = 'unavailable';

export function setRTLTextPlugin(_url: string, callback?: (error?: Error) => void): void {
	rtlTextPluginStatus = 'loaded';
	callback?.();
}

export function getRTLTextPluginStatus(): string {
	return rtlTextPluginStatus;
}

/** Reset module-level state a previous test may have moved. */
export function __resetGlobals(): void {
	rtlTextPluginStatus = 'unavailable';
}

function defaultMarkerElement(): HTMLElement {
	const element = document.createElement('div');
	element.dataset.pin = 'default';
	return element;
}

// Exported under the upstream name; internally it is `MapImpl` so the class
// does not shadow the built-in `Map` this module uses for its own state.
export { MapImpl as Map, LngLat, LngLatBounds, Transform };

export default {
	Map: MapImpl,
	Marker,
	Popup,
	NavigationControl,
	AttributionControl,
	FullscreenControl,
	ScaleControl,
	GeolocateControl,
	LngLat,
	LngLatBounds,
	setRTLTextPlugin,
	getRTLTextPluginStatus,
};
