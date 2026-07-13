// Ported from sonner@2.0.7 src/index.tsx
// (https://github.com/emilkowalski/sonner/tree/v2.0.7).
//
// Octane adaptations:
// - React hooks/isValidElement + ReactDOM.flushSync come directly from octane.
// - forwardRef becomes the normal `ref` prop in ToasterProps.
// - event handlers receive native DOM events.
import {
	flushSync,
	isValidElement,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'octane';
import { CloseIcon, getAsset, Loader } from './assets.tsrx';
import { useIsDocumentHidden } from './hooks.tsrx';
import { toast, ToastState } from './state';
import './styles.css';
import { isAction } from './types';
import type {
	CSSProperties,
	ExternalToast,
	HeightT,
	Position,
	SwipeDirection,
	ToasterProps,
	ToastClassnames,
	ToastIcons,
	ToastProps,
	ToastT,
	ToastTypes,
} from './types';

const VISIBLE_TOASTS_AMOUNT = 3;
const VIEWPORT_OFFSET = '24px';
const MOBILE_VIEWPORT_OFFSET = '16px';
const TOAST_LIFETIME = 4000;
const TOAST_WIDTH = 356;
const GAP = 14;
const SWIPE_THRESHOLD = 45;
const TIME_BEFORE_UNMOUNT = 200;

function cn(...classes: (string | undefined)[]): string {
	return classes.filter(Boolean).join(' ');
}

function getDefaultSwipeDirections(position: string): SwipeDirection[] {
	const [y, x] = position.split('-');
	const directions: SwipeDirection[] = [];
	if (y) directions.push(y as SwipeDirection);
	if (x) directions.push(x as SwipeDirection);
	return directions;
}

function LoadingIcon(props: {
	icons?: ToastIcons;
	classNames?: ToastClassnames;
	toastItem: ToastT;
	toastType?: ToastTypes;
}) @{
	@if (props.icons?.loading) {
		<div
			className={cn(props.classNames?.loader, props.toastItem.classNames?.loader, 'sonner-loader')}
			data-visible={props.toastType === 'loading'}
		>{props.icons.loading}</div>
	} @else {
		<Loader
			className={cn(props.classNames?.loader, props.toastItem.classNames?.loader)}
			visible={props.toastType === 'loading'}
		/>
	}
}

function Toast(props: ToastProps) {
	const {
		invert: toasterInvert,
		toast: toastItem,
		unstyled,
		interacting,
		setHeights,
		visibleToasts,
		heights,
		index,
		toasts,
		expanded,
		removeToast,
		defaultRichColors,
		closeButton: closeButtonFromToaster,
		style,
		cancelButtonStyle,
		actionButtonStyle,
		className = '',
		descriptionClassName = '',
		duration: durationFromToaster,
		position,
		gap,
		expandByDefault,
		classNames,
		icons,
		closeButtonAriaLabel = 'Close toast',
	} = props;
	const [swipeDirection, setSwipeDirection] = useState<'x' | 'y' | null>(null);
	const [swipeOutDirection, setSwipeOutDirection] = useState<
		'left' | 'right' | 'up' | 'down' | null
	>(null);
	const [mounted, setMounted] = useState(false);
	const [removed, setRemoved] = useState(false);
	const [swiping, setSwiping] = useState(false);
	const [swipeOut, setSwipeOut] = useState(false);
	const [isSwiped, setIsSwiped] = useState(false);
	const [offsetBeforeRemove, setOffsetBeforeRemove] = useState(0);
	const [initialHeight, setInitialHeight] = useState(0);
	const remainingTime = useRef(toastItem.duration || durationFromToaster || TOAST_LIFETIME);
	const dragStartTime = useRef<Date | null>(null);
	const toastRef = useRef<HTMLLIElement | null>(null);
	const isFront = index === 0;
	const isVisible = index + 1 <= visibleToasts;
	const toastType = toastItem.type;
	const dismissible = toastItem.dismissible !== false;
	const toastClassname = toastItem.className || '';
	const toastDescriptionClassname = toastItem.descriptionClassName || '';
	const heightIndex = useMemo(
		() => heights.findIndex((height) => height.toastId === toastItem.id) || 0,
		[heights, toastItem.id],
	);
	const closeButton = useMemo(() => toastItem.closeButton ?? closeButtonFromToaster, [
		toastItem.closeButton,
		closeButtonFromToaster,
	]);
	const duration = useMemo(() => toastItem.duration || durationFromToaster || TOAST_LIFETIME, [
		toastItem.duration,
		durationFromToaster,
	]);
	const closeTimerStartTimeRef = useRef(0);
	const offset = useRef(0);
	const lastCloseTimerStartTimeRef = useRef(0);
	const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
	const [y, x] = position.split('-');
	const toastsHeightBefore = useMemo(
		() => heights.reduce((previous, current, reducerIndex) => {
			if (reducerIndex >= heightIndex) return previous;
			return previous + current.height;
		}, 0),
		[heights, heightIndex],
	);
	const isDocumentHidden = useIsDocumentHidden();
	const invert = toastItem.invert || toasterInvert;
	const disabled = toastType === 'loading';

	offset.current = useMemo(() => heightIndex * gap + toastsHeightBefore, [
		heightIndex,
		gap,
		toastsHeightBefore,
	]);

	useEffect(() => {
		remainingTime.current = duration;
	}, [duration]);

	useEffect(() => {
		setMounted(true);
	}, []);

	useEffect(() => {
		const toastNode = toastRef.current;
		if (!toastNode) return;
		const height = toastNode.getBoundingClientRect().height;
		setInitialHeight(height);
		setHeights(
			(current) => [
				{ toastId: toastItem.id, height, position: toastItem.position },
				...current,
			],
		);
		return () => setHeights(
			(current) => current.filter((heightItem) => heightItem.toastId !== toastItem.id),
		);
	}, [setHeights, toastItem.id]);

	useLayoutEffect(() => {
		if (!mounted || !toastRef.current) return;
		const toastNode = toastRef.current;
		const originalHeight = toastNode.style.height;
		toastNode.style.height = 'auto';
		const newHeight = toastNode.getBoundingClientRect().height;
		toastNode.style.height = originalHeight;
		setInitialHeight(newHeight);
		setHeights((current) => {
			const alreadyExists = current.find((height) => height.toastId === toastItem.id);
			if (!alreadyExists) {
				return [
					{ toastId: toastItem.id, height: newHeight, position: toastItem.position },
					...current,
				];
			}
			return current.map(
				(height) => height.toastId === toastItem.id ? { ...height, height: newHeight } : height,
			);
		});
	}, [
		mounted,
		toastItem.title,
		toastItem.description,
		setHeights,
		toastItem.id,
		toastItem.jsx,
		toastItem.action,
		toastItem.cancel,
	]);

	const deleteToast = useCallback(() => {
		setRemoved(true);
		setOffsetBeforeRemove(offset.current);
		setHeights((current) => current.filter((height) => height.toastId !== toastItem.id));
		setTimeout(() => removeToast(toastItem), TIME_BEFORE_UNMOUNT);
	}, [toastItem, removeToast, setHeights, offset]);

	useEffect(() => {
		if (
			toastItem.promise && toastType === 'loading' || toastItem.duration === Infinity ||
				toastItem.type === 'loading'
		) {
			return;
		}
		let timeoutId: ReturnType<typeof setTimeout>;

		const pauseTimer = (): void => {
			if (lastCloseTimerStartTimeRef.current < closeTimerStartTimeRef.current) {
				const elapsedTime = Date.now() - closeTimerStartTimeRef.current;
				remainingTime.current -= elapsedTime;
			}
			lastCloseTimerStartTimeRef.current = Date.now();
		};

		const startTimer = (): void => {
			if (remainingTime.current === Infinity) return;
			closeTimerStartTimeRef.current = Date.now();
			timeoutId = setTimeout(() => {
				toastItem.onAutoClose?.(toastItem);
				deleteToast();
			}, remainingTime.current);
		};

		if (expanded || interacting || isDocumentHidden) pauseTimer();
		else startTimer();

		return () => clearTimeout(timeoutId);
	}, [expanded, interacting, toastItem, toastType, isDocumentHidden, deleteToast]);

	useEffect(() => {
		if (toastItem.delete) {
			deleteToast();
			toastItem.onDismiss?.(toastItem);
		}
	}, [deleteToast, toastItem.delete]);

	const icon =
		toastItem.icon || (toastType ? icons?.[toastType] : undefined) || getAsset(toastType);
	const toasterTypeClass = toastType ? classNames?.[toastType] : undefined;
	const toastTypeClass = toastType ? toastItem.classNames?.[toastType] : undefined;

	return <li
		tabIndex={0}
		ref={toastRef}
		className={cn(
			className,
			toastClassname,
			classNames?.toast,
			toastItem.classNames?.toast,
			classNames?.default,
			toasterTypeClass,
			toastTypeClass,
		)}
		data-sonner-toast=""
		data-rich-colors={toastItem.richColors ?? defaultRichColors}
		data-styled={!Boolean(toastItem.jsx || toastItem.unstyled || unstyled)}
		data-mounted={mounted}
		data-promise={Boolean(toastItem.promise)}
		data-swiped={isSwiped}
		data-removed={removed}
		data-visible={isVisible}
		data-y-position={y}
		data-x-position={x}
		data-index={index}
		data-front={isFront}
		data-swiping={swiping}
		data-dismissible={dismissible}
		data-type={toastType}
		data-invert={invert}
		data-swipe-out={swipeOut}
		data-swipe-direction={swipeOutDirection}
		data-expanded={Boolean(expanded || expandByDefault && mounted)}
		data-testid={toastItem.testId}
		style={{
			'--index': index,
			'--toasts-before': index,
			'--z-index': toasts.length - index,
			'--offset': `${removed ? offsetBeforeRemove : offset.current}px`,
			'--initial-height': expandByDefault ? 'auto' : `${initialHeight}px`,
			...style,
			...toastItem.style,
		}}
		onDragEnd={() => {
			setSwiping(false);
			setSwipeDirection(null);
			pointerStartRef.current = null;
		}}
		onPointerDown={(event: PointerEvent) => {
			if (event.button === 2 || disabled || !dismissible) return;
			dragStartTime.current = new Date();
			setOffsetBeforeRemove(offset.current);
			(event.target as HTMLElement).setPointerCapture(event.pointerId);
			if ((event.target as HTMLElement).tagName === 'BUTTON') return;
			setSwiping(true);
			pointerStartRef.current = { x: event.clientX, y: event.clientY };
		}}
		onPointerUp={() => {
			if (swipeOut || !dismissible) return;
			pointerStartRef.current = null;
			const swipeAmountX = Number(
				toastRef.current?.style.getPropertyValue('--swipe-amount-x').replace('px', '') || 0,
			);
			const swipeAmountY = Number(
				toastRef.current?.style.getPropertyValue('--swipe-amount-y').replace('px', '') || 0,
			);
			const timeTaken = Date.now() - (dragStartTime.current?.getTime() ?? 0);
			const swipeAmount =
				swipeDirection === 'x' ? swipeAmountX : swipeAmountY;
			const velocity = Math.abs(swipeAmount) / timeTaken;

			if (Math.abs(swipeAmount) >= SWIPE_THRESHOLD || velocity > 0.11) {
				setOffsetBeforeRemove(offset.current);
				toastItem.onDismiss?.(toastItem);
				if (swipeDirection === 'x') {
					setSwipeOutDirection(swipeAmountX > 0 ? 'right' : 'left');
				} else {
					setSwipeOutDirection(swipeAmountY > 0 ? 'down' : 'up');
				}
				deleteToast();
				setSwipeOut(true);
				return;
			}

			toastRef.current?.style.setProperty('--swipe-amount-x', '0px');
			toastRef.current?.style.setProperty('--swipe-amount-y', '0px');
			setIsSwiped(false);
			setSwiping(false);
			setSwipeDirection(null);
		}}
		onPointerMove={(event: PointerEvent) => {
			if (!pointerStartRef.current || !dismissible) return;
			if ((window.getSelection()?.toString().length ?? 0) > 0) return;
			const yDelta = event.clientY - pointerStartRef.current.y;
			const xDelta = event.clientX - pointerStartRef.current.x;
			const swipeDirections = props.swipeDirections ?? getDefaultSwipeDirections(position);

			if (!swipeDirection && (Math.abs(xDelta) > 1 || Math.abs(yDelta) > 1)) {
				setSwipeDirection(Math.abs(xDelta) > Math.abs(yDelta) ? 'x' : 'y');
			}

			const swipeAmount = { x: 0, y: 0 };
			const getDampening = (delta: number): number => {
				const factor = Math.abs(delta) / 20;
				return 1 / (1.5 + factor);
			};

			if (swipeDirection === 'y') {
				if (swipeDirections.includes('top') || swipeDirections.includes('bottom')) {
					if (
						swipeDirections.includes('top') && yDelta < 0 ||
							swipeDirections.includes('bottom') && yDelta > 0
					) {
						swipeAmount.y = yDelta;
					} else {
						const dampenedDelta = yDelta * getDampening(yDelta);
						swipeAmount.y = Math.abs(dampenedDelta) < Math.abs(yDelta) ? dampenedDelta : yDelta;
					}
				}
			} else if (swipeDirection === 'x') {
				if (swipeDirections.includes('left') || swipeDirections.includes('right')) {
					if (
						swipeDirections.includes('left') && xDelta < 0 ||
							swipeDirections.includes('right') && xDelta > 0
					) {
						swipeAmount.x = xDelta;
					} else {
						const dampenedDelta = xDelta * getDampening(xDelta);
						swipeAmount.x = Math.abs(dampenedDelta) < Math.abs(xDelta) ? dampenedDelta : xDelta;
					}
				}
			}

			if (Math.abs(swipeAmount.x) > 0 || Math.abs(swipeAmount.y) > 0) {
				setIsSwiped(true);
			}
			toastRef.current?.style.setProperty('--swipe-amount-x', `${swipeAmount.x}px`);
			toastRef.current?.style.setProperty('--swipe-amount-y', `${swipeAmount.y}px`);
		}}
	>
		{closeButton && !toastItem.jsx && toastType !== 'loading'
			? <button
					aria-label={closeButtonAriaLabel}
					data-disabled={disabled}
					data-close-button="true"
					onClick={disabled || !dismissible
						? () => {}
						: () => {
								deleteToast();
								toastItem.onDismiss?.(toastItem);
							}}
					className={cn(classNames?.closeButton, toastItem.classNames?.closeButton)}
				>
					{icons?.close ?? CloseIcon}
				</button>
			: null}
		{(toastType || toastItem.icon || toastItem.promise) && toastItem.icon !== null &&
		((toastType ? icons?.[toastType] : undefined) !== null || toastItem.icon)
			? <div data-icon="" className={cn(classNames?.icon, toastItem.classNames?.icon)}>
					{toastItem.promise || toastItem.type === 'loading' && !toastItem.icon
						? toastItem.icon ||
							<LoadingIcon
								icons={icons}
								classNames={classNames}
								toastItem={toastItem}
								toastType={toastType}
							/>
						: null}
					{toastItem.type !== 'loading' ? icon : null}
				</div>
			: null}
		<div data-content="" className={cn(classNames?.content, toastItem.classNames?.content)}>
			<div data-title="" className={cn(classNames?.title, toastItem.classNames?.title)}>
				{toastItem.jsx
					? toastItem.jsx
					: typeof toastItem.title === 'function'
						? toastItem.title()
						: toastItem.title}
			</div>
			{toastItem.description
				? <div
						data-description=""
						className={cn(
							descriptionClassName,
							toastDescriptionClassname,
							classNames?.description,
							toastItem.classNames?.description,
						)}
					>
						{typeof toastItem.description === 'function'
							? toastItem.description()
							: toastItem.description}
					</div>
				: null}
		</div>
		{isValidElement(toastItem.cancel)
			? (toastItem.cancel)
			: toastItem.cancel && isAction(toastItem.cancel)
				? <button
						data-button="true"
						data-cancel="true"
						style={toastItem.cancelButtonStyle || cancelButtonStyle}
						onClick={(event: MouseEvent) => {
							if (!isAction(toastItem.cancel) || !dismissible) return;
							toastItem.cancel.onClick(event as any);
							deleteToast();
						}}
						className={cn(classNames?.cancelButton, toastItem.classNames?.cancelButton)}
					>{toastItem.cancel.label}</button>
				: null}
		{isValidElement(toastItem.action)
			? (toastItem.action)
			: toastItem.action && isAction(toastItem.action)
				? <button
						data-button="true"
						data-action="true"
						style={toastItem.actionButtonStyle || actionButtonStyle}
						onClick={(event: MouseEvent) => {
							if (!isAction(toastItem.action)) return;
							toastItem.action.onClick(event as any);
							if (event.defaultPrevented) return;
							deleteToast();
						}}
						className={cn(classNames?.actionButton, toastItem.classNames?.actionButton)}
					>{toastItem.action.label}</button>
				: null}
	</li>;
}

function getDocumentDirection(): ToasterProps['dir'] {
	if (typeof window === 'undefined' || typeof document === 'undefined') return 'ltr';
	const direction = document.documentElement.getAttribute('dir');
	if (direction === 'auto' || !direction) {
		return window.getComputedStyle(document.documentElement).direction as ToasterProps['dir'];
	}
	return direction as ToasterProps['dir'];
}

function assignOffset(
	defaultOffset: ToasterProps['offset'],
	mobileOffset: ToasterProps['mobileOffset'],
): CSSProperties {
	const styles: CSSProperties = {};
	[defaultOffset, mobileOffset].forEach((offset, index) => {
		const isMobile = index === 1;
		const prefix = isMobile ? '--mobile-offset' : '--offset';
		const defaultValue = isMobile ? MOBILE_VIEWPORT_OFFSET : VIEWPORT_OFFSET;
		const assignAll = (value: string | number): void => {
			['top', 'right', 'bottom', 'left'].forEach((key) => {
				styles[`${prefix}-${key}`] = typeof value === 'number' ? `${value}px` : value;
			});
		};

		if (typeof offset === 'number' || typeof offset === 'string') {
			assignAll(offset);
		} else if (typeof offset === 'object' && offset !== null) {
			(['top', 'right', 'bottom', 'left'] as const).forEach((key) => {
				const value = offset[key];
				styles[`${prefix}-${key}`] = value === undefined
					? defaultValue
					: typeof value === 'number'
						? `${value}px`
						: value;
			});
		} else {
			assignAll(defaultValue);
		}
	});
	return styles;
}

export function useSonner(): { toasts: ToastT[] } {
	const [activeToasts, setActiveToasts] = useState<ToastT[]>([]);

	useEffect(
		() => ToastState.subscribe((published) => {
			if ('dismiss' in published) {
				setTimeout(() => {
					flushSync(() => {
						setActiveToasts(
							(current) => current.filter((toastItem) => toastItem.id !== published.id),
						);
					});
				});
				return;
			}

			setTimeout(() => {
				flushSync(() => {
					setActiveToasts((current) => {
						const existing = current.findIndex((toastItem) => toastItem.id === published.id);
						if (existing !== -1) {
							return [
								...current.slice(0, existing),
								{ ...current[existing], ...published },
								...current.slice(existing + 1),
							];
						}
						return [published, ...current];
					});
				});
			});
		}),
		[],
	);

	return { toasts: activeToasts };
}

export function Toaster(props: ToasterProps) {
	const {
		id,
		invert,
		position = 'bottom-right',
		hotkey = ['altKey', 'KeyT'],
		expand,
		closeButton,
		className,
		offset: viewportOffset,
		mobileOffset,
		theme = 'light',
		richColors,
		duration,
		style,
		visibleToasts = VISIBLE_TOASTS_AMOUNT,
		toastOptions,
		dir = getDocumentDirection(),
		gap = GAP,
		icons,
		containerAriaLabel = 'Notifications',
		ref,
	} = props;
	const [toasts, setToasts] = useState<ToastT[]>([]);
	const filteredToasts = useMemo(
		() => id
			? toasts.filter((toastItem) => toastItem.toasterId === id)
			: toasts.filter((toastItem) => !toastItem.toasterId),
		[toasts, id],
	);
	const possiblePositions = useMemo(() => {
		const dynamicPositions = filteredToasts.filter((toastItem) => toastItem.position).map(
			(toastItem) => toastItem.position as Position,
		);
		return Array.from(new Set<Position>([position, ...dynamicPositions]));
	}, [filteredToasts, position]);
	const [heights, setHeights] = useState<HeightT[]>([]);
	const [expanded, setExpanded] = useState(false);
	const [interacting, setInteracting] = useState(false);
	const [actualTheme, setActualTheme] = useState<'light' | 'dark'>(
		theme !== 'system'
			? theme
			: typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
				? 'dark'
				: 'light',
	);
	const listRef = useRef<HTMLOListElement | null>(null);
	const hotkeyLabel = hotkey.join('+').replace(/Key/g, '').replace(/Digit/g, '');
	const lastFocusedElementRef = useRef<HTMLElement | null>(null);
	const isFocusWithinRef = useRef(false);

	const removeToast = useCallback((toastToRemove: ToastT) => {
		setToasts((current) => {
			if (!current.find((toastItem) => toastItem.id === toastToRemove.id)?.delete) {
				ToastState.dismiss(toastToRemove.id);
			}
			return current.filter((toastItem) => toastItem.id !== toastToRemove.id);
		});
	}, []);

	useEffect(
		() => ToastState.subscribe((published) => {
			if ('dismiss' in published) {
				requestAnimationFrame(() => {
					setToasts(
						(current) => current.map(
							(toastItem) => toastItem.id === published.id
								? { ...toastItem, delete: true }
								: toastItem,
						),
					);
				});
				return;
			}

			setTimeout(() => {
				flushSync(() => {
					setToasts((current) => {
						const existing = current.findIndex((toastItem) => toastItem.id === published.id);
						if (existing !== -1) {
							return [
								...current.slice(0, existing),
								{ ...current[existing], ...published },
								...current.slice(existing + 1),
							];
						}
						return [published, ...current];
					});
				});
			});
		}),
		[],
	);

	useEffect(() => {
		if (theme !== 'system') {
			setActualTheme(theme);
			return;
		}

		if (typeof window === 'undefined' || !window.matchMedia) return;
		const darkMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		const updateTheme = ({ matches }: MediaQueryListEvent): void => {
			setActualTheme(matches ? 'dark' : 'light');
		};
		setActualTheme(darkMediaQuery.matches ? 'dark' : 'light');
		try {
			darkMediaQuery.addEventListener('change', updateTheme);
			return () => darkMediaQuery.removeEventListener('change', updateTheme);
		} catch {
			darkMediaQuery.addListener(updateTheme);
			return () => darkMediaQuery.removeListener(updateTheme);
		}
	}, [theme]);

	useEffect(() => {
		if (toasts.length <= 1) setExpanded(false);
	}, [toasts]);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent): void => {
			const isHotkeyPressed = hotkey.every((key) => (event as any)[key] || event.code === key);
			if (isHotkeyPressed) {
				setExpanded(true);
				listRef.current?.focus();
			}
			if (
				event.code === 'Escape' &&
					(document.activeElement === listRef.current ||
						listRef.current?.contains(document.activeElement))
			) {
				setExpanded(false);
			}
		};
		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [hotkey]);

	useEffect(() => {
		if (!listRef.current) return;
		return () => {
			if (lastFocusedElementRef.current) {
				lastFocusedElementRef.current.focus({ preventScroll: true });
				lastFocusedElementRef.current = null;
				isFocusWithinRef.current = false;
			}
		};
	}, [listRef.current]);

	return <section
		ref={ref}
		aria-label={`${containerAriaLabel} ${hotkeyLabel}`}
		tabIndex={-1}
		aria-live="polite"
		aria-relevant="additions text"
		aria-atomic="false"
		suppressHydrationWarning
	>
		@for (const currentPosition of possiblePositions; index positionIndex; key currentPosition) {
			@if (filteredToasts.length) {
				<ol
					dir={dir === 'auto' ? getDocumentDirection() : dir}
					tabIndex={-1}
					ref={listRef}
					className={className}
					data-sonner-toaster="true"
					data-sonner-theme={actualTheme}
					data-y-position={currentPosition.split('-')[0]}
					data-x-position={currentPosition.split('-')[1]}
					style={{
						'--front-toast-height': `${heights[0]?.height || 0}px`,
						'--width': `${TOAST_WIDTH}px`,
						'--gap': `${gap}px`,
						...style,
						...assignOffset(viewportOffset, mobileOffset),
					}}
					onBlur={(event: FocusEvent) => {
						const currentTarget = event.currentTarget as HTMLOListElement;
						if (
							isFocusWithinRef.current &&
								!currentTarget.contains(event.relatedTarget as Node | null)
						) {
							isFocusWithinRef.current = false;
							if (lastFocusedElementRef.current) {
								lastFocusedElementRef.current.focus({ preventScroll: true });
								lastFocusedElementRef.current = null;
							}
						}
					}}
					onFocus={(event: FocusEvent) => {
						const target = event.target;
						const isNotDismissible =
							target instanceof HTMLElement && target.dataset.dismissible === 'false';
						if (isNotDismissible) return;
						if (!isFocusWithinRef.current) {
							isFocusWithinRef.current = true;
							lastFocusedElementRef.current = event.relatedTarget as HTMLElement;
						}
					}}
					onMouseEnter={() => setExpanded(true)}
					onMouseMove={() => setExpanded(true)}
					onMouseLeave={() => {
						if (!interacting) setExpanded(false);
					}}
					onDragEnd={() => setExpanded(false)}
					onPointerDown={(event: PointerEvent) => {
						const target = event.target;
						const isNotDismissible =
							target instanceof HTMLElement && target.dataset.dismissible === 'false';
						if (!isNotDismissible) setInteracting(true);
					}}
					onPointerUp={() => setInteracting(false)}
				>
					@for (const toastItem of filteredToasts.filter(
						(item) => !item.position && positionIndex === 0 || item.position === currentPosition,
					); index toastIndex; key toastItem.id) {
						<Toast
							icons={icons}
							index={toastIndex}
							toast={toastItem}
							defaultRichColors={richColors}
							duration={toastOptions?.duration ?? duration}
							className={toastOptions?.className}
							descriptionClassName={toastOptions?.descriptionClassName}
							invert={invert}
							visibleToasts={visibleToasts}
							closeButton={toastOptions?.closeButton ?? closeButton}
							interacting={interacting}
							position={currentPosition}
							style={toastOptions?.style}
							unstyled={toastOptions?.unstyled}
							classNames={toastOptions?.classNames}
							cancelButtonStyle={toastOptions?.cancelButtonStyle}
							actionButtonStyle={toastOptions?.actionButtonStyle}
							closeButtonAriaLabel={toastOptions?.closeButtonAriaLabel}
							removeToast={removeToast}
							toasts={filteredToasts.filter((item) => item.position == toastItem.position)}
							heights={heights.filter((height) => height.position == toastItem.position)}
							setHeights={setHeights}
							expandByDefault={expand}
							gap={gap}
							expanded={expanded}
							swipeDirections={props.swipeDirections}
						/>
					}
				</ol>
			}
		}
	</section>;
}

export { toast };
export { ExternalToast, ToastT, ToasterProps };
