import { FC } from 'octane';

export type TableCellButtonProps = {
	hideOtherElements: (hide: boolean) => void;
	tableCellMenu?: FC;
};
