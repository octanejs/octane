import type { ThreeElements } from '@octanejs/three';
import * as THREE from 'three';
import { shaderMaterial } from './shaderMaterial.js';

export type SplatMaterialType = {
	alphaTest?: number;
	alphaHash?: boolean;
	centerAndScaleTexture?: THREE.DataTexture;
	covAndColorTexture?: THREE.DataTexture;
	viewport?: THREE.Vector2;
	focal?: number;
};

export type TargetMesh = THREE.Mesh<
	THREE.InstancedBufferGeometry,
	THREE.ShaderMaterial & SplatMaterialType
> & {
	ready: boolean;
	sorted: boolean;
	pm: THREE.Matrix4;
	vm1: THREE.Matrix4;
	vm2: THREE.Matrix4;
	viewport: THREE.Vector4;
};

export type SharedState = {
	url: string;
	gl: THREE.WebGLRenderer;
	worker: Worker;
	manager: THREE.LoadingManager;
	stream: ReadableStreamDefaultReader<Uint8Array>;
	loading: boolean;
	loaded: boolean;
	loadedVertexCount: number;
	rowLength: number;
	maxVertexes: number;
	chunkSize: number;
	totalDownloadBytes: number;
	numVertices: number;
	bufferTextureWidth: number;
	bufferTextureHeight: number;
	centerAndScaleData: Float32Array;
	covAndColorData: Uint32Array;
	covAndColorTexture: THREE.DataTexture;
	centerAndScaleTexture: THREE.DataTexture;
	connect(target: TargetMesh): () => void;
	update(target: TargetMesh, camera: THREE.Camera, hashed: boolean): void;
	onProgress?: (event: ProgressEvent) => void;
};

export type SplatProps = {
	src: string;
	toneMapped?: boolean;
	alphaTest?: number;
	alphaHash?: boolean;
	chunkSize?: number;
} & Omit<ThreeElements['mesh'], 'ref'>;

export const SplatMaterial = /* @__PURE__ */ shaderMaterial(
	{
		alphaTest: 0,
		viewport: new THREE.Vector2(1980, 1080),
		focal: 1000,
		centerAndScaleTexture: null,
		covAndColorTexture: null,
	},
	/* glsl */ `
    precision highp sampler2D;
    precision highp usampler2D;
    out vec4 vColor;
    out vec3 vPosition;
    uniform vec2 resolution;
    uniform vec2 viewport;
    uniform float focal;
    attribute uint splatIndex;
    uniform sampler2D centerAndScaleTexture;
    uniform usampler2D covAndColorTexture;

    vec2 unpackInt16(in uint value) {
      int v = int(value);
      int v0 = v >> 16;
      int v1 = (v & 0xFFFF);
      if((v & 0x8000) != 0) v1 |= 0xFFFF0000;
      return vec2(float(v1), float(v0));
    }

    void main () {
      ivec2 texSize = textureSize(centerAndScaleTexture, 0);
      ivec2 texPos = ivec2(splatIndex%uint(texSize.x), splatIndex/uint(texSize.x));
      vec4 centerAndScaleData = texelFetch(centerAndScaleTexture, texPos, 0);
      vec4 center = vec4(centerAndScaleData.xyz, 1);
      vec4 camspace = modelViewMatrix * center;
      vec4 pos2d = projectionMatrix * camspace;
      float bounds = 1.2 * pos2d.w;
      if (pos2d.z < -pos2d.w || pos2d.x < -bounds || pos2d.x > bounds || pos2d.y < -bounds || pos2d.y > bounds) {
        gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
        return;
      }
      uvec4 covAndColorData = texelFetch(covAndColorTexture, texPos, 0);
      vec2 cov3D_M11_M12 = unpackInt16(covAndColorData.x) * centerAndScaleData.w;
      vec2 cov3D_M13_M22 = unpackInt16(covAndColorData.y) * centerAndScaleData.w;
      vec2 cov3D_M23_M33 = unpackInt16(covAndColorData.z) * centerAndScaleData.w;
      mat3 Vrk = mat3(
        cov3D_M11_M12.x, cov3D_M11_M12.y, cov3D_M13_M22.x,
        cov3D_M11_M12.y, cov3D_M13_M22.y, cov3D_M23_M33.x,
        cov3D_M13_M22.x, cov3D_M23_M33.x, cov3D_M23_M33.y
      );
      mat3 J = mat3(
        focal / camspace.z, 0., -(focal * camspace.x) / (camspace.z * camspace.z),
        0., focal / camspace.z, -(focal * camspace.y) / (camspace.z * camspace.z),
        0., 0., 0.
      );
      mat3 W = transpose(mat3(modelViewMatrix));
      mat3 T = W * J;
      mat3 cov = transpose(T) * Vrk * T;
      vec2 vCenter = vec2(pos2d) / pos2d.w;
      float diagonal1 = cov[0][0] + 0.3;
      float offDiagonal = cov[0][1];
      float diagonal2 = cov[1][1] + 0.3;
      float mid = 0.5 * (diagonal1 + diagonal2);
      float radius = length(vec2((diagonal1 - diagonal2) / 2.0, offDiagonal));
      float lambda1 = mid + radius;
      float lambda2 = max(mid - radius, 0.1);
      vec2 diagonalVector = normalize(vec2(offDiagonal, lambda1 - diagonal1));
      vec2 v1 = min(sqrt(2.0 * lambda1), 1024.0) * diagonalVector;
      vec2 v2 = min(sqrt(2.0 * lambda2), 1024.0) * vec2(diagonalVector.y, -diagonalVector.x);
      uint colorUint = covAndColorData.w;
      vColor = vec4(
        float(colorUint & uint(0xFF)) / 255.0,
        float((colorUint >> uint(8)) & uint(0xFF)) / 255.0,
        float((colorUint >> uint(16)) & uint(0xFF)) / 255.0,
        float(colorUint >> uint(24)) / 255.0
      );
      vPosition = position;
      gl_Position = vec4(vCenter + position.x * v2 / viewport * 2.0 + position.y * v1 / viewport * 2.0, pos2d.z / pos2d.w, 1.0);
    }
  `,
	/* glsl */ `
    #include <alphatest_pars_fragment>
    #include <alphahash_pars_fragment>
    in vec4 vColor;
    in vec3 vPosition;
    void main () {
      float A = -dot(vPosition.xy, vPosition.xy);
      if (A < -4.0) discard;
      float B = exp(A) * vColor.a;
      vec4 diffuseColor = vec4(vColor.rgb, B);
      #include <alphatest_fragment>
      #include <alphahash_fragment>
      gl_FragColor = diffuseColor;
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
);

function createWorker(self: any) {
	let matrices: Float32Array = null!;
	let offset = 0;
	function sortSplats(view: Float32Array, hashed = false) {
		const vertexCount = matrices.length / 16;
		const threshold = -0.0001;
		let maxDepth = -Infinity;
		let minDepth = Infinity;
		const depthList = new Float32Array(vertexCount);
		const sizeList = new Int32Array(depthList.buffer);
		const validIndexList = new Int32Array(vertexCount);
		let validCount = 0;
		for (let index = 0; index < vertexCount; index++) {
			const depth =
				view[0] * matrices[index * 16 + 12] +
				view[1] * matrices[index * 16 + 13] +
				view[2] * matrices[index * 16 + 14] +
				view[3];
			if (hashed || (depth < 0 && matrices[index * 16 + 15] > threshold * depth)) {
				depthList[validCount] = depth;
				validIndexList[validCount] = index;
				validCount++;
				if (depth > maxDepth) maxDepth = depth;
				if (depth < minDepth) minDepth = depth;
			}
		}
		const depthInverse = (256 * 256 - 1) / (maxDepth - minDepth);
		const counts = new Uint32Array(256 * 256);
		for (let index = 0; index < validCount; index++) {
			sizeList[index] = ((depthList[index] - minDepth) * depthInverse) | 0;
			counts[sizeList[index]]++;
		}
		const starts = new Uint32Array(256 * 256);
		for (let index = 1; index < 256 * 256; index++)
			starts[index] = starts[index - 1] + counts[index - 1];
		const depthIndex = new Uint32Array(validCount);
		for (let index = 0; index < validCount; index++)
			depthIndex[starts[sizeList[index]]++] = validIndexList[index];
		return depthIndex;
	}
	self.onmessage = (event: {
		data: {
			method: string;
			length: number;
			key: string;
			view: ArrayBuffer;
			matrices: ArrayBuffer;
			hashed: boolean;
		};
	}) => {
		if (event.data.method === 'push') {
			if (offset === 0) matrices = new Float32Array(event.data.length);
			const newMatrices = new Float32Array(event.data.matrices);
			matrices.set(newMatrices, offset);
			offset += newMatrices.length;
		} else if (event.data.method === 'sort' && matrices !== null) {
			const indices = sortSplats(new Float32Array(event.data.view), event.data.hashed);
			self.postMessage({ indices, key: event.data.key }, [indices.buffer]);
		}
	};
}

export class SplatLoader extends THREE.Loader<SharedState> {
	gl: THREE.WebGLRenderer = null!;
	chunkSize = 25000;
	override load(
		url: string,
		onLoad: (data: SharedState) => void,
		onProgress?: (event: ProgressEvent) => void,
		onError?: (event: unknown) => void,
	): void {
		const shared: SharedState = {
			gl: this.gl,
			url: this.manager.resolveURL(url),
			worker: new Worker(
				URL.createObjectURL(
					new Blob(['(', createWorker.toString(), ')(self)'], { type: 'application/javascript' }),
				),
			),
			manager: this.manager,
			update: (target: TargetMesh, camera: THREE.Camera, hashed: boolean) =>
				update(camera, shared, target, hashed),
			connect: (target: TargetMesh) => connect(shared, target),
			loading: false,
			loaded: false,
			loadedVertexCount: 0,
			chunkSize: this.chunkSize,
			totalDownloadBytes: 0,
			numVertices: 0,
			rowLength: 32,
			maxVertexes: 0,
			bufferTextureWidth: 0,
			bufferTextureHeight: 0,
			stream: null!,
			centerAndScaleData: null!,
			covAndColorData: null!,
			covAndColorTexture: null!,
			centerAndScaleTexture: null!,
			onProgress,
		};
		load(shared)
			.then(onLoad)
			.catch((error) => {
				onError?.(error);
				shared.manager.itemError(shared.url);
			});
	}
}

async function load(shared: SharedState): Promise<SharedState> {
	shared.manager.itemStart(shared.url);
	const response = await fetch(shared.url);
	if (response.body === null) throw 'Failed to fetch file';
	const contentLength = response.headers.get('Content-Length');
	const totalDownloadBytes = contentLength ? Number.parseInt(contentLength) : undefined;
	if (totalDownloadBytes === undefined) throw 'Failed to get content length';
	shared.stream = response.body.getReader();
	shared.totalDownloadBytes = totalDownloadBytes;
	shared.numVertices = Math.floor(shared.totalDownloadBytes / shared.rowLength);
	const context = shared.gl.getContext();
	const maxTextureSize = context.getParameter(context.MAX_TEXTURE_SIZE);
	shared.maxVertexes = maxTextureSize * maxTextureSize;
	if (shared.numVertices > shared.maxVertexes) shared.numVertices = shared.maxVertexes;
	shared.bufferTextureWidth = maxTextureSize;
	shared.bufferTextureHeight = Math.floor((shared.numVertices - 1) / maxTextureSize) + 1;
	shared.centerAndScaleData = new Float32Array(
		shared.bufferTextureWidth * shared.bufferTextureHeight * 4,
	);
	shared.covAndColorData = new Uint32Array(
		shared.bufferTextureWidth * shared.bufferTextureHeight * 4,
	);
	shared.centerAndScaleTexture = new THREE.DataTexture(
		shared.centerAndScaleData,
		shared.bufferTextureWidth,
		shared.bufferTextureHeight,
		THREE.RGBAFormat,
		THREE.FloatType,
	);
	shared.centerAndScaleTexture.needsUpdate = true;
	shared.covAndColorTexture = new THREE.DataTexture(
		shared.covAndColorData,
		shared.bufferTextureWidth,
		shared.bufferTextureHeight,
		THREE.RGBAIntegerFormat,
		THREE.UnsignedIntType,
	);
	shared.covAndColorTexture.internalFormat = 'RGBA32UI';
	shared.covAndColorTexture.needsUpdate = true;
	return shared;
}

async function lazyLoad(shared: SharedState): Promise<void> {
	shared.loading = true;
	let bytesDownloaded = 0;
	let bytesProcessed = 0;
	const chunks: Uint8Array[] = [];
	let lastReportedProgress = 0;
	const lengthComputable = shared.totalDownloadBytes !== 0;
	while (true) {
		try {
			const { value, done } = await shared.stream.read();
			if (done) break;
			bytesDownloaded += value.length;
			if (shared.totalDownloadBytes !== undefined) {
				const percent = (bytesDownloaded / shared.totalDownloadBytes) * 100;
				if (shared.onProgress && percent - lastReportedProgress > 1) {
					shared.onProgress(
						new ProgressEvent('progress', {
							lengthComputable,
							loaded: bytesDownloaded,
							total: shared.totalDownloadBytes,
						}),
					);
					lastReportedProgress = percent;
				}
			}
			chunks.push(value);
			const bytesRemaining = bytesDownloaded - bytesProcessed;
			if (
				shared.totalDownloadBytes !== undefined &&
				bytesRemaining > shared.rowLength * shared.chunkSize
			) {
				const vertexCount = Math.floor(bytesRemaining / shared.rowLength);
				const concatenated = new Uint8Array(bytesRemaining);
				let offset = 0;
				for (const chunk of chunks) {
					concatenated.set(chunk, offset);
					offset += chunk.length;
				}
				chunks.length = 0;
				if (bytesRemaining > vertexCount * shared.rowLength) {
					const extra = new Uint8Array(bytesRemaining - vertexCount * shared.rowLength);
					extra.set(concatenated.subarray(bytesRemaining - extra.length), 0);
					chunks.push(extra);
				}
				const buffer = new Uint8Array(vertexCount * shared.rowLength);
				buffer.set(concatenated.subarray(0, buffer.byteLength), 0);
				const matrices = pushDataBuffer(shared, buffer.buffer, vertexCount);
				shared.worker.postMessage(
					{
						method: 'push',
						src: shared.url,
						length: shared.numVertices * 16,
						matrices: matrices.buffer,
					},
					[matrices.buffer],
				);
				bytesProcessed += vertexCount * shared.rowLength;
				shared.onProgress?.(
					new ProgressEvent('progress', {
						lengthComputable,
						loaded: shared.totalDownloadBytes,
						total: shared.totalDownloadBytes,
					}),
				);
			}
		} catch (error) {
			console.error(error);
			break;
		}
	}
	if (bytesDownloaded - bytesProcessed > 0) {
		const concatenated = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
		let offset = 0;
		for (const chunk of chunks) {
			concatenated.set(chunk, offset);
			offset += chunk.length;
		}
		const numVertices = Math.floor(concatenated.byteLength / shared.rowLength);
		const matrices = pushDataBuffer(shared, concatenated.buffer, numVertices);
		shared.worker.postMessage(
			{ method: 'push', src: shared.url, length: numVertices * 16, matrices: matrices.buffer },
			[matrices.buffer],
		);
	}
	shared.loaded = true;
	shared.manager.itemEnd(shared.url);
}

function update(
	camera: THREE.Camera,
	shared: SharedState,
	target: TargetMesh,
	hashed: boolean,
): void {
	camera.updateMatrixWorld();
	shared.gl.getCurrentViewport(target.viewport);
	target.material.viewport!.x = target.viewport.z;
	target.material.viewport!.y = target.viewport.w;
	target.material.focal = (target.viewport.w / 2) * Math.abs(camera.projectionMatrix.elements[5]);
	if (target.ready) {
		if (hashed && target.sorted) return;
		target.ready = false;
		const view = new Float32Array([
			target.modelViewMatrix.elements[2],
			-target.modelViewMatrix.elements[6],
			target.modelViewMatrix.elements[10],
			target.modelViewMatrix.elements[14],
		]);
		shared.worker.postMessage(
			{ method: 'sort', src: shared.url, key: target.uuid, view: view.buffer, hashed },
			[view.buffer],
		);
		if (hashed && shared.loaded) target.sorted = true;
	}
}

function connect(shared: SharedState, target: TargetMesh): () => void {
	if (!shared.loading) void lazyLoad(shared);
	target.ready = false;
	target.pm = new THREE.Matrix4();
	target.vm1 = new THREE.Matrix4();
	target.vm2 = new THREE.Matrix4();
	target.viewport = new THREE.Vector4();
	const splatIndexArray = new Uint32Array(shared.bufferTextureWidth * shared.bufferTextureHeight);
	const splatIndexes = new THREE.InstancedBufferAttribute(splatIndexArray, 1, false);
	splatIndexes.setUsage(THREE.DynamicDrawUsage);
	const geometry = (target.geometry = new THREE.InstancedBufferGeometry());
	const positions = new THREE.BufferAttribute(new Float32Array(18), 3);
	geometry.setAttribute('position', positions);
	positions.setXYZ(2, -2, 2, 0);
	positions.setXYZ(1, 2, 2, 0);
	positions.setXYZ(0, -2, -2, 0);
	positions.setXYZ(5, -2, -2, 0);
	positions.setXYZ(4, 2, 2, 0);
	positions.setXYZ(3, 2, -2, 0);
	positions.needsUpdate = true;
	geometry.setAttribute('splatIndex', splatIndexes);
	geometry.instanceCount = 1;
	function listener(event: MessageEvent<{ key: string; indices: Uint32Array }>) {
		if (target && event.data.key === target.uuid) {
			const indexes = new Uint32Array(event.data.indices);
			(geometry.attributes.splatIndex as THREE.InstancedBufferAttribute).set(indexes);
			geometry.attributes.splatIndex.needsUpdate = true;
			geometry.instanceCount = indexes.length;
			target.ready = true;
		}
	}
	shared.worker.addEventListener('message', listener);
	async function wait() {
		while (true) {
			const centerProperties = shared.gl.properties.get(shared.centerAndScaleTexture) as
				{ __webglTexture?: unknown } | undefined;
			const colorProperties = shared.gl.properties.get(shared.covAndColorTexture) as
				{ __webglTexture?: unknown } | undefined;
			if (
				centerProperties?.__webglTexture &&
				colorProperties?.__webglTexture &&
				shared.loadedVertexCount > 0
			)
				break;
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
		target.ready = true;
	}
	void wait();
	return () => shared.worker.removeEventListener('message', listener);
}

function pushDataBuffer(
	shared: SharedState,
	buffer: ArrayBufferLike,
	requestedVertexCount: number,
): Float32Array {
	const context = shared.gl.getContext();
	let vertexCount = requestedVertexCount;
	if (shared.loadedVertexCount + vertexCount > shared.maxVertexes)
		vertexCount = shared.maxVertexes - shared.loadedVertexCount;
	if (vertexCount <= 0) throw 'Failed to parse file';
	const bytes = new Uint8Array(buffer);
	const floats = new Float32Array(buffer);
	const matrices = new Float32Array(vertexCount * 16);
	const colorBytes = new Uint8Array(shared.covAndColorData.buffer);
	const covariance = new Int16Array(shared.covAndColorData.buffer);
	for (let index = 0; index < vertexCount; index++) {
		const quaternion = new THREE.Quaternion(
			-(bytes[32 * index + 29] - 128) / 128,
			(bytes[32 * index + 30] - 128) / 128,
			(bytes[32 * index + 31] - 128) / 128,
			-(bytes[32 * index + 28] - 128) / 128,
		);
		quaternion.invert();
		const center = new THREE.Vector3(
			floats[8 * index],
			floats[8 * index + 1],
			-floats[8 * index + 2],
		);
		const scale = new THREE.Vector3(
			floats[8 * index + 3],
			floats[8 * index + 4],
			floats[8 * index + 5],
		);
		const matrix = new THREE.Matrix4();
		matrix.makeRotationFromQuaternion(quaternion);
		matrix.transpose();
		matrix.scale(scale);
		const transpose = matrix.clone();
		matrix.transpose();
		matrix.premultiply(transpose);
		matrix.setPosition(center);
		const covarianceIndexes = [0, 1, 2, 5, 6, 10];
		let maximum = 0;
		for (const covarianceIndex of covarianceIndexes)
			if (Math.abs(matrix.elements[covarianceIndex]) > maximum)
				maximum = Math.abs(matrix.elements[covarianceIndex]);
		let destination = shared.loadedVertexCount * 4 + index * 4;
		shared.centerAndScaleData[destination] = center.x;
		shared.centerAndScaleData[destination + 1] = -center.y;
		shared.centerAndScaleData[destination + 2] = center.z;
		shared.centerAndScaleData[destination + 3] = maximum / 32767;
		destination = shared.loadedVertexCount * 8 + index * 8;
		for (let component = 0; component < covarianceIndexes.length; component++)
			covariance[destination + component] =
				(matrix.elements[covarianceIndexes[component]] * 32767) / maximum;
		destination = shared.loadedVertexCount * 16 + (index * 4 + 3) * 4;
		const color = new THREE.Color(
			bytes[32 * index + 24] / 255,
			bytes[32 * index + 25] / 255,
			bytes[32 * index + 26] / 255,
		);
		color.convertSRGBToLinear();
		colorBytes[destination] = color.r * 255;
		colorBytes[destination + 1] = color.g * 255;
		colorBytes[destination + 2] = color.b * 255;
		colorBytes[destination + 3] = bytes[32 * index + 27];
		matrix.elements[15] = (Math.max(scale.x, scale.y, scale.z) * bytes[32 * index + 27]) / 255;
		for (let component = 0; component < 16; component++)
			matrices[index * 16 + component] = matrix.elements[component];
	}
	while (vertexCount > 0) {
		let width = 0;
		let height = 0;
		const xOffset = shared.loadedVertexCount % shared.bufferTextureWidth;
		const yOffset = Math.floor(shared.loadedVertexCount / shared.bufferTextureWidth);
		if (shared.loadedVertexCount % shared.bufferTextureWidth !== 0) {
			width = Math.min(shared.bufferTextureWidth, xOffset + vertexCount) - xOffset;
			height = 1;
		} else if (Math.floor(vertexCount / shared.bufferTextureWidth) > 0) {
			width = shared.bufferTextureWidth;
			height = Math.floor(vertexCount / shared.bufferTextureWidth);
		} else {
			width = vertexCount % shared.bufferTextureWidth;
			height = 1;
		}
		const centerProperties = shared.gl.properties.get(shared.centerAndScaleTexture) as {
			__webglTexture: WebGLTexture;
		};
		context.bindTexture(context.TEXTURE_2D, centerProperties.__webglTexture);
		context.texSubImage2D(
			context.TEXTURE_2D,
			0,
			xOffset,
			yOffset,
			width,
			height,
			context.RGBA,
			context.FLOAT,
			shared.centerAndScaleData,
			shared.loadedVertexCount * 4,
		);
		const colorProperties = shared.gl.properties.get(shared.covAndColorTexture) as {
			__webglTexture: WebGLTexture;
		};
		context.bindTexture(context.TEXTURE_2D, colorProperties.__webglTexture);
		context.texSubImage2D(
			context.TEXTURE_2D,
			0,
			xOffset,
			yOffset,
			width,
			height,
			(context as WebGL2RenderingContext).RGBA_INTEGER,
			context.UNSIGNED_INT,
			shared.covAndColorData,
			shared.loadedVertexCount * 4,
		);
		shared.gl.resetState();
		shared.loadedVertexCount += width * height;
		vertexCount -= width * height;
	}
	return matrices;
}
