import { useRouter } from './context.ts';
import { createAsset } from './assetComponent.tsrx';

export const Asset = createAsset(useRouter);
export type { AssetProps } from './assetComponent.tsrx';
