import ContentLoader from './ContentLoader.tsrx';
import type { IContentLoaderProps } from './types';

export type { IContentLoaderProps };

export { default as Facebook } from './presets/FacebookStyle.tsrx';
export { default as Instagram } from './presets/InstagramStyle.tsrx';
export { default as Code } from './presets/CodeStyle.tsrx';
export { default as List } from './presets/ListStyle.tsrx';
export { default as BulletList } from './presets/BulletListStyle.tsrx';

export default ContentLoader;
