import * as THREE from 'three';
import { COLORS } from '../../utils/colors';

export class Sky {
	mesh: THREE.Mesh;
	private material: THREE.ShaderMaterial;

	constructor() {
		const geometry = new THREE.SphereGeometry(800, 32, 32);

		this.material = new THREE.ShaderMaterial({
			uniforms: {
				topColor: { value: new THREE.Color(COLORS.sky.top) },
				midColor: { value: new THREE.Color(COLORS.sky.mid) },
				bottomColor: { value: new THREE.Color(COLORS.sky.horizon) },
				sunDirection: { value: new THREE.Vector3(0.5, 0.3, 0.5).normalize() },
				uTime: { value: 0 },
			},
			vertexShader: `
        varying vec3 vWorldPosition;
        varying vec3 vDirection;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          vDirection = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
			fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 bottomColor;
        uniform vec3 sunDirection;
        uniform float uTime;
        varying vec3 vWorldPosition;
        varying vec3 vDirection;
        
        void main() {
          float h = normalize(vWorldPosition).y;
          
          // Base sky gradient
          vec3 color;
          if (h < 0.0) {
            color = bottomColor;
          } else if (h < 0.3) {
            color = mix(bottomColor, midColor, h / 0.3);
          } else {
            color = mix(midColor, topColor, (h - 0.3) / 0.7);
          }
          
          // Sun glow
          float sunDot = max(dot(vDirection, sunDirection), 0.0);
          
          // Soft outer glow
          float sunGlow = pow(sunDot, 8.0) * 0.4;
          vec3 sunGlowColor = vec3(1.0, 0.95, 0.8);
          color = mix(color, sunGlowColor, sunGlow);
          
          // Bright sun core
          float sunCore = pow(sunDot, 64.0) * 0.8;
          vec3 sunCoreColor = vec3(1.0, 1.0, 0.95);
          color = mix(color, sunCoreColor, sunCore);
          
          // Subtle horizon haze
          float horizonHaze = 1.0 - abs(h);
          horizonHaze = pow(horizonHaze, 3.0) * 0.15;
          color = mix(color, vec3(1.0, 0.98, 0.95), horizonHaze);
          
          gl_FragColor = vec4(color, 1.0);
        }
      `,
			side: THREE.BackSide,
			fog: false,
		});

		this.mesh = new THREE.Mesh(geometry, this.material);
	}

	update(time: number): void {
		this.material.uniforms.uTime.value = time;
	}

	dispose(): void {
		this.mesh.geometry.dispose();
		(this.mesh.material as THREE.ShaderMaterial).dispose();
	}
}
