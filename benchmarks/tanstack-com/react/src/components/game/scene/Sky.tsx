import { useMemo } from 'react';
import * as THREE from 'three';
import { COLORS } from '../utils/colors';

export function Sky() {
	const geometry = useMemo(() => {
		return new THREE.SphereGeometry(500, 32, 32);
	}, []);

	const material = useMemo(() => {
		// Gradient shader for sky
		return new THREE.ShaderMaterial({
			uniforms: {
				topColor: { value: new THREE.Color(COLORS.sky.top) },
				midColor: { value: new THREE.Color(COLORS.sky.mid) },
				bottomColor: { value: new THREE.Color(COLORS.sky.horizon) },
			},
			vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
			fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 bottomColor;
        varying vec3 vWorldPosition;
        
        void main() {
          float h = normalize(vWorldPosition).y;
          
          // Blend from bottom (horizon) to mid to top
          vec3 color;
          if (h < 0.0) {
            color = bottomColor;
          } else if (h < 0.3) {
            color = mix(bottomColor, midColor, h / 0.3);
          } else {
            color = mix(midColor, topColor, (h - 0.3) / 0.7);
          }
          
          gl_FragColor = vec4(color, 1.0);
        }
      `,
			side: THREE.BackSide,
		});
	}, []);

	return <mesh geometry={geometry} material={material} />;
}
