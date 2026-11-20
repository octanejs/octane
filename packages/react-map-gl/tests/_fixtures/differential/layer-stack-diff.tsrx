/**
 * A stack of layers, each anchored beneath the next with `beforeId`, the way an
 * app orders user-chosen layers. Adding a layer on top re-anchors the layer
 * below it to a layer created in the same render.
 */
import { Layer, Map, Source, useMap } from '@octanejs/react-map-gl';
import { useState } from 'octane';

function OrderProbe() @{
	const [order, setOrder] = useState('');
	const maps = useMap();

	<div>
		<button
			id="snap"
			onClick={() => {
				const map = maps.current;
				if (!map) return;
				setOrder((map.getStyle()!.layers as any[]).map((layer) => layer.id).join(','));
			}}
		>
			snap
		</button>
		<pre id="order">{order as string}</pre>
	</div>
}

export function LayerStackDiff(props: any) @{
	const [ids, setIds] = useState(['lower']);

	<div>
		<button id="add-upper" onClick={() => setIds(['lower', 'upper'])}>
			add upper
		</button>
		<Map
			mapLib={props.mapLib}
			mapboxAccessToken="test-token"
			initialViewState={{ longitude: -100, latitude: 40, zoom: 4 }}
			onError={() => {}}
		>
			<OrderProbe />
			<Source id="data" type="geojson" data={{ type: 'FeatureCollection', features: [] }}>
				@for (const id of ids; key id) {
					<Layer id={id} type="circle" beforeId={ids[ids.indexOf(id) + 1]} />
				}
			</Source>
		</Map>
	</div>
}
