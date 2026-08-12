export function isWebGL2Available(): boolean {
	try {
		const canvas = document.createElement('canvas');
		return Boolean(window.WebGL2RenderingContext && canvas.getContext('webgl2'));
	} catch {
		return false;
	}
}
