export interface RichProgressBlock {
	id: string;
	text: string;
	state: 'active' | 'complete';
}

export interface RichParagraph {
	id: string;
	text: string;
}

export interface RichLink {
	id: string;
	label: string;
	href: string;
}

export interface RichPlace {
	id: string;
	label: string;
	x: number;
	y: number;
}

export interface RichConversationProps {
	title: string;
	progress: readonly RichProgressBlock[];
	paragraphs: readonly RichParagraph[];
	links: readonly RichLink[];
	places: readonly RichPlace[];
	mapReady: boolean;
	selectedPlace: string | null;
	viewBox: string;
	onActivateMap(): void;
	onSelectPlace(id: string): void;
	onZoom(direction: 'in' | 'out'): void;
}

export type Props = RichConversationProps;

interface DeterministicMapProps {
	places: readonly RichPlace[];
	selectedPlace: string | null;
	viewBox: string;
	onSelectPlace(id: string): void;
	onZoom(direction: 'in' | 'out'): void;
}

// An interactive SVG fixture, not a substitute for an external map provider.
// Selection and viewport belong to the caller, independently of streamed rows.
function DeterministicMap(props: DeterministicMapProps) @{
	<section id="rich-map" aria-label="Deterministic map fixture">
		<div>
			<button id="rich-zoom-in" type="button" onClick={() => props.onZoom('in')}>Zoom in</button>
			<button id="rich-zoom-out" type="button" onClick={() => props.onZoom('out')}>Zoom out</button>
		</div>
		<svg id="rich-map-svg" viewBox={props.viewBox} width="480" height="240" aria-hidden="true">
			<rect x="0" y="0" width="100" height="50" fill="#e7f1e8" />
			<path d="M0 35 Q30 5 55 30 T100 15" fill="none" stroke="#9dc4e2" stroke-width="4" />
			@for (const place of props.places; key place.id) {
				<circle
					data-place={place.id}
					cx={place.x}
					cy={place.y}
					r={props.selectedPlace === place.id ? 3 : 2}
					fill={props.selectedPlace === place.id ? '#c43e36' : '#245ca6'}
					onClick={() => props.onSelectPlace(place.id)}
				/>
			}
		</svg>
		<ul id="rich-places" aria-label="Map places">
			@for (const place of props.places; key place.id) {
				<li data-place-row={place.id}>
					<button
						type="button"
						aria-pressed={props.selectedPlace === place.id}
						onClick={() => props.onSelectPlace(place.id)}
					>{place.label as string}</button>
				</li>
			}
		</ul>
	</section>
}

export function RichConversation(props: RichConversationProps) @{
	'use dom bindings';
	<section data-rich aria-labelledby="rich-title">
		<h1 id="rich-title">{props.title as string}</h1>
		<ol id="rich-progress" aria-label="Response progress">
			@for (const block of props.progress; key block.id) {
				<li data-progress={block.id} data-state={block.state}>{block.text as string}</li>
			}
		</ol>
		<article id="rich-response" aria-label="Response">
			@for (const paragraph of props.paragraphs; key paragraph.id) {
				<p data-paragraph={paragraph.id}>{paragraph.text as string}</p>
			}
			<ul id="rich-links" aria-label="Response links">
				@for (const link of props.links; key link.id) {
					<li data-link={link.id}>
						<a href={link.href}>{link.label as string}</a>
					</li>
				}
			</ul>
		</article>
		@if (props.mapReady) {
			<DeterministicMap
				places={props.places}
				selectedPlace={props.selectedPlace}
				viewBox={props.viewBox}
				onSelectPlace={props.onSelectPlace}
				onZoom={props.onZoom}
			/>
		} @else {
			<section id="rich-map-placeholder" aria-label="Map preview">
				<p>Places will appear in an interactive map.</p>
				<button id="rich-activate-map" type="button" onClick={props.onActivateMap}>Show map</button>
			</section>
		}
	</section>
}
