import { Image, type ImageProps } from '@octanejs/drei';
import type { Texture } from 'three';

const byUrl: ImageProps = { url: '/image.png', scale: [2, 1], zoom: 1.2 };
const byTexture: ImageProps = { texture: {} as Texture, grayscale: 0.5 };
void byUrl;
void byTexture;
void Image;

// @ts-expect-error url and texture are mutually exclusive
const both: ImageProps = { url: '/image.png', texture: {} as Texture };
void both;
