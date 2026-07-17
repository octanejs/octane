import { extend, useFrame } from '@octanejs/three';
import { DisposableObject } from '../shared.js';

const Disposable = extend(DisposableObject);

function FrameSubscriber(props) @{
	useFrame(() => props.record(props.id));
	<group name={'frame-' + props.id} />
}

export function BenchScene(props) @{
	<>
		@if (props.mode === 'mesh') {
			@for (const item of props.items; key item.id) {
				<mesh name={item.name} position={[item.x, 0, 0]} />
			}
		}
		@if (props.mode === 'disposable') {
			@for (const item of props.items; key item.id) {
				<Disposable args={[item.id, props.version]} />
			}
		}
		@if (props.mode === 'frames') {
			@for (const item of props.items; key item.id) {
				<FrameSubscriber id={item.id} record={props.recordFrame} />
			}
		}
		@if (props.mode === 'events') {
			@for (const item of props.items; key item.id) {
				<mesh
					name={item.name}
					position={[0, 0, item.z]}
					geometry={props.geometry}
					material={props.material}
					onPointerMove={() => props.recordEvent(item.id)}
				/>
			}
		}
	</>
}
