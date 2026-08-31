import { FC } from 'octane';

export type TableHandleProps = {
	orientation: 'row' | 'column';
	hideOtherElements: (hide: boolean) => void;
	tableHandleMenu?: FC;
};
