import * as THREE from 'three';
import { publishSizeChecksum } from './renderer.js';

const scene = new THREE.Scene();
const mesh = new THREE.Mesh();
mesh.name = 'size-mesh';
scene.add(mesh);
publishSizeChecksum(scene, Object.keys(THREE).length);
