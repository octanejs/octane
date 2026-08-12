import { Preload, type PreloadProps } from '../src/index.js';
import { PerspectiveCamera, Scene } from 'three';

const props: PreloadProps = { all: true, scene: new Scene(), camera: new PerspectiveCamera() };
Preload;
props;

// @ts-expect-error all is boolean
const invalidAll: PreloadProps = { all: 'yes' };
// @ts-expect-error camera must be a Three camera
const invalidCamera: PreloadProps = { camera: {} };
