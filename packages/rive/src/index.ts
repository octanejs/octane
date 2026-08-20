import Rive from './components/Rive.ts';
import type { RiveProps } from './components/Rive.ts';
import useRive from './hooks/useRive.ts';
import useStateMachineInput from './hooks/useStateMachineInput.ts';
import useViewModel from './hooks/useViewModel.ts';
import useViewModelInstance from './hooks/useViewModelInstance.ts';
import useGlobalViewModelInstance from './hooks/useGlobalViewModelInstance.ts';
import useViewModelInstanceNumber from './hooks/useViewModelInstanceNumber.ts';
import useViewModelInstanceString from './hooks/useViewModelInstanceString.ts';
import useViewModelInstanceBoolean from './hooks/useViewModelInstanceBoolean.ts';
import useViewModelInstanceColor from './hooks/useViewModelInstanceColor.ts';
import useViewModelInstanceEnum from './hooks/useViewModelInstanceEnum.ts';
import useViewModelInstanceTrigger from './hooks/useViewModelInstanceTrigger.ts';
import useViewModelInstanceImage from './hooks/useViewModelInstanceImage.ts';
import useViewModelInstanceFont from './hooks/useViewModelInstanceFont.ts';
import useViewModelInstanceList from './hooks/useViewModelInstanceList.ts';
import useResizeCanvas from './hooks/useResizeCanvas.ts';
import useRiveFile from './hooks/useRiveFile.ts';
import useViewModelInstanceArtboard from './hooks/useViewModelInstanceArtboard.ts';

export default Rive;
export {
	useRive,
	useStateMachineInput,
	useResizeCanvas,
	useRiveFile,
	useViewModel,
	useViewModelInstance,
	useGlobalViewModelInstance,
	useViewModelInstanceNumber,
	useViewModelInstanceString,
	useViewModelInstanceBoolean,
	useViewModelInstanceColor,
	useViewModelInstanceEnum,
	useViewModelInstanceTrigger,
	useViewModelInstanceImage,
	useViewModelInstanceFont,
	useViewModelInstanceList,
	useViewModelInstanceArtboard,
};
export type { RiveProps };
export type {
	RiveState,
	UseRiveParameters,
	UseRiveFileParameters,
	UseRiveOptions,
} from './types.ts';
export * from '@rive-app/canvas';
