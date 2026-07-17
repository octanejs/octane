import { Mesh, Scene } from 'three';
import { publishSizeChecksum } from './renderer.js';

const scene = new Scene();
const mesh = new Mesh();
mesh.name = 'size-mesh';
scene.add(mesh);
publishSizeChecksum(scene);
