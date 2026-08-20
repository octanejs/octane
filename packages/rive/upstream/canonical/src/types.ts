import type {
  decodeFont,
  decodeImage,
  Rive,
  RiveFile,
  RiveFileParameters,
  RiveParameters,
  ViewModelInstance,
  ViewModelInstanceArtboard,
} from '@rive-app/canvas';
import { ComponentProps, RefCallback } from 'react';

export type UseRiveParameters =
  | (Partial<Omit<RiveParameters, 'canvas'>> & {
      onRiveReady?: (rive: Rive) => void;
    })
  | null;

export type UseRiveOptions = {
  useDevicePixelRatio: boolean;
  customDevicePixelRatio: number;
  fitCanvasToArtboardHeight: boolean;
  useOffscreenRenderer: boolean;
  shouldResizeCanvasToContainer: boolean;
  shouldUseIntersectionObserver?: boolean;
};

export type Dimensions = {
  width: number;
  height: number;
};

/**
 * @typedef RiveState
 * @property canvas - Canvas element the Rive Animation is attached to.
 * @property container - Container element of the canvas.
 * @property setCanvasRef - Ref callback to be passed to the canvas element.
 * @property setContainerRef - Ref callback to be passed to the container
 * element of the canvas. This is optional, however if not used then the hook
 * will not take care of automatically resizing the canvas to it's outer
 *   container if the window resizes.
 * @property rive - The loaded Rive Animation
 */
export type RiveState = {
  canvas: HTMLCanvasElement | null;
  container: HTMLElement | null;
  setCanvasRef: RefCallback<HTMLCanvasElement>;
  setContainerRef: RefCallback<HTMLElement>;
  rive: Rive | null;
  RiveComponent: (props: ComponentProps<'canvas'>) => JSX.Element;
};

export type UseRiveFileParameters = Partial<
  Omit<RiveFileParameters, 'onLoad' | 'onLoadError'>
>;

export type FileStatus = 'idle' | 'loading' | 'failed' | 'success';

/**
 * @typedef RiveFileState
 * @property data - The RiveFile instance
 * @property status - The status of the file
 */
export type RiveFileState = {
  riveFile: RiveFile | null;
  status: FileStatus;
};

/**
 * Parameters for useViewModel hook.
 *
 * @property name - When provided, specifies the name of the ViewModel to retrieve.
 * @property useDefault - When true, uses the default ViewModel from the Rive instance.
 */
export type UseViewModelParameters =
  | { name: string; useDefault?: never }
  | { useDefault?: boolean; name?: never };

/**
 * Parameters for useViewModelInstance hook.
 *
 * @property name - When provided, specifies the name of the instance to retrieve.
 * @property useDefault - When true, uses the default instance from the ViewModel.
 * @property useNew - When true, creates a new instance of the ViewModel.
 * @property rive - If provided, automatically binds the instance to this Rive instance.
 */
export type UseViewModelInstanceParameters =
  | { name: string; useDefault?: never; useNew?: never; rive?: Rive | null }
  | { useDefault?: boolean; name?: never; useNew?: never; rive?: Rive | null }
  | { useNew?: boolean; name?: never; useDefault?: never; rive?: Rive | null };

/**
 * Parameters for useGlobalViewModelInstance. Selects which instance to resolve
 * from the view model (default when none given); `rive` binds it.
 *
 * @property instanceName - Resolve the view model instance with this instance name.
 * @property useNew - Create a new blank instance of the view model.
 * @property instance - Register this caller-supplied instance directly. May be null while it loads.
 * @property rive - Registers the instance as the global and schedules a coalesced
 * bind. Required for the hook to register/bind anything.
 */
export type UseGlobalViewModelInstanceParameters =
  | { instanceName: string; useNew?: never; instance?: never; rive?: Rive | null }
  | { useNew?: boolean; instanceName?: never; instance?: never; rive?: Rive | null }
  | { instance?: ViewModelInstance | null; instanceName?: never; useNew?: never; rive?: Rive | null };

/**
 * Parameters for interacting with trigger properties of a ViewModelInstance
 * @property onTrigger - Callback that runs when the trigger fires
 */
export type UseViewModelInstanceTriggerParameters = {
  onTrigger?: () => void;
};

export type UseViewModelInstanceNumberResult = {
  /**
   * The current value of the number.
   */
  value: number | null;
  /**
   * Set the value of the number.
   * @param value - The value to set the number to.
   */
  setValue: (value: number) => void;
};
export type UseViewModelInstanceStringResult = {
  /**
   * The current value of the string.
   */
  value: string | null;
  /**
   * Set the value of the string.
   * @param value - The value to set the string to.
   */
  setValue: (value: string) => void;
};
export type UseViewModelInstanceBooleanResult = {
  /**
   * The current value of the boolean.
   */
  value: boolean | null;
  /**
   * Set the value of the boolean.
   * @param value - The value to set the boolean to.
   */
  setValue: (value: boolean) => void;
};

export type UseViewModelInstanceColorResult = {
  /**
   * The current value of the color.
   */
  value: number | null;
  /**
   * Set the value of the color.
   * @param value - The value to set the color to.
   */
  setValue: (value: number) => void;
  /**
   * Set the red value of the color.
   * @param r - The red value to set the color to.
   */
  setRgb: (r: number, g: number, b: number) => void;
  /**
   * Set the red, green, blue, and alpha values of the color.
   * @param r - The red value to set the color to.
   * @param g - The green value to set the color to.
   * @param b - The blue value to set the color to.
   * @param a - The alpha value to set the color to.
   */
  setRgba: (r: number, g: number, b: number, a: number) => void;
  /**
   * Set the alpha value of the color.
   * @param a - The alpha value to set the color to.
   */
  setAlpha: (a: number) => void;
  /**
   * Set the opacity value of the color.
   * @param o - The opacity value to set the color to.
   */
  setOpacity: (o: number) => void;
};

export type UseViewModelInstanceEnumResult = {
  /**
   * The current value of the enum.
   */
  value: string | null;
  /**
   * Set the value of the enum.
   * @param value - The value to set the enum to.
   */
  setValue: (value: string) => void;
  /**
   * The values of the enum.
   */
  values: string[];
};

export type UseViewModelInstanceTriggerResult = {
  /**
   * Fires the property trigger.
   */
  trigger: () => void;
};

export type RiveRenderImage = Awaited<ReturnType<typeof decodeImage>>;

export type UseViewModelInstanceImageResult = {
  /**
   * Set the value of the image.
   * @param value - The image to set.
   */
  setValue: (value: RiveRenderImage | null) => void;
};

export type RiveDecodedFont = Awaited<ReturnType<typeof decodeFont>>;

export type UseViewModelInstanceFontResult = {
  /**
   * Set the value of the font.
   * @param value - The decoded font to set (from `decodeFont`), or null to clear.
   */
  setValue: (value: RiveDecodedFont | null) => void;
};

export type UseViewModelInstanceListResult = {
  /**
   * The current length of the list.
   */
  length: number;
  /**
   * Add an instance to the end of the list.
   * @param instance - The ViewModelInstance to add.
   */
  addInstance: (instance: ViewModelInstance) => void;
  /**
   * Add an instance at a specific index in the list.
   * @param instance - The ViewModelInstance to add.
   * @param index - The index to add the instance at.
   * @returns True if the instance was successfully added, false otherwise.
   */
  addInstanceAt: (instance: ViewModelInstance, index: number) => boolean;
  /**
   * Remove an instance from the list.
   * @param instance - The ViewModelInstance to remove.
   */
  removeInstance: (instance: ViewModelInstance) => void;
  /**
   * Remove an instance at a specific index from the list.
   * @param index - The index to remove the instance from.
   */
  removeInstanceAt: (index: number) => void;
  /**
   * Get an instance at a specific index from the list.
   * @param index - The index to get the instance from.
   * @returns The ViewModelInstance at the index, or null if not found.
   */
  getInstanceAt: (index: number) => ViewModelInstance | null;
  /**
   * Swap two instances in the list.
   * @param a - The first index.
   * @param b - The second index.
   */
  swap: (a: number, b: number) => void;
};

export type UseViewModelInstanceArtboardResult = {
  /**
   * Set the value of the artboard.
   * @param value - The artboard to set.
   */
  setValue: (
    value: ViewModelInstanceArtboard extends { value: infer T } ? T : never
  ) => void;
};
