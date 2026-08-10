import { FaceLandmarker, useFaceLandmarker } from '@octanejs/drei';

function Reader(props) @{
	props.onContext(useFaceLandmarker());
}

export function FaceLandmarkerScene(props) @{
	@try {
		<FaceLandmarker ref={props.landmarkerRef} basePath={props.basePath} options={props.options}>
			<Reader onContext={props.onContext} />
		</FaceLandmarker>
	} @pending {
		<group name="loading-face-landmarker" />
	}
}
