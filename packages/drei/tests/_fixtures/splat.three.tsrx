import { Splat } from '@octanejs/drei';

function SplatContent(props) @{
	<>
		<Splat
			src={props.src}
			alphaTest={props.alphaTest}
			alphaHash={props.alphaHash}
			toneMapped={props.toneMapped}
			chunkSize={props.chunkSize}
			position={props.firstPosition}
			name="first-splat"
		/>
		@if (props.second) {
			<Splat
				src={props.src}
				alphaTest={props.secondAlphaTest}
				alphaHash={props.secondAlphaHash}
				toneMapped={props.secondToneMapped}
				chunkSize={props.secondChunkSize}
				position={props.secondPosition}
				name="second-splat"
			/>
		}
	</>
}

export function SplatScene(props) @{
	@try {
		<SplatContent {...props} />
	} @pending {
		null;
	}
}
