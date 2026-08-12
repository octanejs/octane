import type {
	FaceLandmarker as FaceLandmarkerImpl,
	FaceLandmarkerOptions,
} from '@mediapipe/tasks-vision';

export async function loadFaceLandmarker(
	_prefix: string,
	basePath: string,
	serializedOptions: string,
): Promise<FaceLandmarkerImpl> {
	const { FilesetResolver, FaceLandmarker: Implementation } =
		await import('@mediapipe/tasks-vision');
	const vision = await FilesetResolver.forVisionTasks(basePath);
	return Implementation.createFromOptions(
		vision,
		JSON.parse(serializedOptions) as FaceLandmarkerOptions,
	);
}
