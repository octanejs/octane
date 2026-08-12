import * as THREE from 'three';
import { FullScreenQuad } from 'three-stdlib';

type Quad = { material: THREE.ShaderMaterial; render(renderer: any): void };
const quad = (material: THREE.ShaderMaterial) =>
	new FullScreenQuad(material as any) as unknown as Quad;

export function makeSDFGenerator(clientWidth: number, clientHeight: number, renderer: any) {
	const finalTarget = new THREE.WebGLRenderTarget(clientWidth, clientHeight, {
		minFilter: THREE.LinearMipmapLinearFilter,
		magFilter: THREE.LinearFilter,
		type: THREE.FloatType,
		format: THREE.RedFormat,
		generateMipmaps: true,
	});
	const outsideRenderTarget = new THREE.WebGLRenderTarget(clientWidth, clientHeight, {
		minFilter: THREE.NearestFilter,
		magFilter: THREE.NearestFilter,
	});
	const insideRenderTarget = new THREE.WebGLRenderTarget(clientWidth, clientHeight, {
		minFilter: THREE.NearestFilter,
		magFilter: THREE.NearestFilter,
	});
	const outsideRenderTarget2 = new THREE.WebGLRenderTarget(clientWidth, clientHeight, {
		minFilter: THREE.NearestFilter,
		magFilter: THREE.NearestFilter,
	});
	const insideRenderTarget2 = new THREE.WebGLRenderTarget(clientWidth, clientHeight, {
		minFilter: THREE.NearestFilter,
		magFilter: THREE.NearestFilter,
	});
	const outsideRenderTargetFinal = new THREE.WebGLRenderTarget(clientWidth, clientHeight, {
		minFilter: THREE.NearestFilter,
		magFilter: THREE.NearestFilter,
		type: THREE.FloatType,
		format: THREE.RedFormat,
	});
	const insideRenderTargetFinal = new THREE.WebGLRenderTarget(clientWidth, clientHeight, {
		minFilter: THREE.NearestFilter,
		magFilter: THREE.NearestFilter,
		type: THREE.FloatType,
		format: THREE.RedFormat,
	});
	const vertexShader = `varying vec2 vUv;
		void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
	const uvRender = quad(
		new THREE.ShaderMaterial({
			uniforms: { tex: { value: null } },
			vertexShader,
			fragmentShader: `uniform sampler2D tex; varying vec2 vUv; #include <packing>
			void main() { gl_FragColor = pack2HalfToRGBA(vUv * (round(texture2D(tex, vUv).x))); }`,
		}),
	);
	const uvRenderInside = quad(
		new THREE.ShaderMaterial({
			uniforms: { tex: { value: null } },
			vertexShader,
			fragmentShader: `uniform sampler2D tex; varying vec2 vUv; #include <packing>
			void main() { gl_FragColor = pack2HalfToRGBA(vUv * (1.0 - round(texture2D(tex, vUv).x))); }`,
		}),
	);
	const jumpFloodRender = quad(
		new THREE.ShaderMaterial({
			uniforms: {
				tex: { value: null },
				offset: { value: 0 },
				level: { value: 0 },
				maxSteps: { value: 0 },
			},
			vertexShader,
			fragmentShader: `varying vec2 vUv; uniform sampler2D tex; uniform float offset; uniform float level; uniform float maxSteps; #include <packing>
			void main() {
				float closestDist = 9999999.9; vec2 closestPos = vec2(0.0);
				for (float x = -1.0; x <= 1.0; x += 1.0) {
					for (float y = -1.0; y <= 1.0; y += 1.0) {
						vec2 voffset = vUv; voffset += vec2(x, y) * vec2(${1 / clientWidth}, ${1 / clientHeight}) * offset;
						vec2 pos = unpackRGBATo2Half(texture2D(tex, voffset)); float dist = distance(pos.xy, vUv);
						if(pos.x != 0.0 && pos.y != 0.0 && dist < closestDist) { closestDist = dist; closestPos = pos; }
					}
				}
				gl_FragColor = pack2HalfToRGBA(closestPos);
			}`,
		}),
	);
	const distanceFieldRender = quad(
		new THREE.ShaderMaterial({
			uniforms: {
				tex: { value: null },
				size: { value: new THREE.Vector2(clientWidth, clientHeight) },
			},
			vertexShader,
			fragmentShader: `varying vec2 vUv; uniform sampler2D tex; uniform vec2 size; #include <packing>
			void main() { gl_FragColor = vec4(distance(size * unpackRGBATo2Half(texture2D(tex, vUv)), size * vUv), 0.0, 0.0, 0.0); }`,
		}),
	);
	const compositeRender = quad(
		new THREE.ShaderMaterial({
			uniforms: {
				inside: { value: insideRenderTargetFinal.texture },
				outside: { value: outsideRenderTargetFinal.texture },
				tex: { value: null },
			},
			vertexShader,
			fragmentShader: `varying vec2 vUv; uniform sampler2D inside; uniform sampler2D outside; uniform sampler2D tex; #include <packing>
			void main() {
				float i = texture2D(inside, vUv).x; float o = texture2D(outside, vUv).x;
				if (texture2D(tex, vUv).x == 0.0) gl_FragColor = vec4(o, 0.0, 0.0, 0.0);
				else gl_FragColor = vec4(-i, 0.0, 0.0, 0.0);
			}`,
		}),
	);
	const runJumpFlood = (
		initialTarget: THREE.WebGLRenderTarget,
		alternateTarget: THREE.WebGLRenderTarget,
	) => {
		const passes = Math.ceil(Math.log(Math.max(clientWidth, clientHeight)) / Math.log(2));
		let lastTarget = initialTarget;
		let target = initialTarget;
		for (let index = 0; index < passes; index++) {
			const offset = Math.pow(2, passes - index - 1);
			target = lastTarget === initialTarget ? alternateTarget : initialTarget;
			jumpFloodRender.material.uniforms.level.value = index;
			jumpFloodRender.material.uniforms.maxSteps.value = passes;
			jumpFloodRender.material.uniforms.offset.value = offset;
			jumpFloodRender.material.uniforms.tex.value = lastTarget.texture;
			renderer.setRenderTarget(target);
			jumpFloodRender.render(renderer);
			lastTarget = target;
		}
		return target;
	};
	return (image: THREE.Texture) => {
		image.minFilter = THREE.NearestFilter;
		image.magFilter = THREE.NearestFilter;
		uvRender.material.uniforms.tex.value = image;
		renderer.setRenderTarget(outsideRenderTarget);
		uvRender.render(renderer);
		let target = runJumpFlood(outsideRenderTarget, outsideRenderTarget2);
		renderer.setRenderTarget(outsideRenderTargetFinal);
		distanceFieldRender.material.uniforms.tex.value = target.texture;
		distanceFieldRender.render(renderer);
		uvRenderInside.material.uniforms.tex.value = image;
		renderer.setRenderTarget(insideRenderTarget);
		uvRenderInside.render(renderer);
		target = runJumpFlood(insideRenderTarget, insideRenderTarget2);
		renderer.setRenderTarget(insideRenderTargetFinal);
		distanceFieldRender.material.uniforms.tex.value = target.texture;
		distanceFieldRender.render(renderer);
		renderer.setRenderTarget(finalTarget);
		compositeRender.material.uniforms.tex.value = image;
		compositeRender.render(renderer);
		renderer.setRenderTarget(null);
		return finalTarget;
	};
}
