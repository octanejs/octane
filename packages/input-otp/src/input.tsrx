'use client';

import {
	createContext,
	createElement,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type OctaneNode,
} from 'octane';

import { syncTimeouts } from './sync-timeouts';
import type { OTPInputProps, RenderProps } from './types';
import { usePrevious } from './use-previous';
import { usePasswordManagerBadge } from './use-pwm-badge';

export const OTPInputContext = createContext<RenderProps>({} as RenderProps);
const PASSWORD_MANAGER_BADGE_SLOT = Symbol('input-otp:password-manager-badge');

export function OTPInput(props: OTPInputProps) {
	const {
		value: controlledValue,
		onChange: consumerOnChange,
		maxLength,
		textAlign = 'left',
		pattern,
		placeholder,
		inputMode = 'numeric',
		onComplete,
		pushPasswordManagerStrategy = 'increase-width',
		pasteTransformer,
		containerClassName,
		noScriptCSSFallback = NOSCRIPT_CSS_FALLBACK,
		nonce,
		render,
		children,
		ref,
		onInput: consumerOnInput,
		onPaste: consumerOnPaste,
		onMouseOver: consumerOnMouseOver,
		onMouseLeave: consumerOnMouseLeave,
		onFocus: consumerOnFocus,
		onBlur: consumerOnBlur,
		autoComplete,
		defaultValue,
		spellCheck,
		...inputProps
	} = props;

	const [internalValue, setInternalValue] = useState(
		typeof defaultValue === 'string' ? defaultValue : '',
	);
	const value = controlledValue ?? internalValue;
	const previousValue = usePrevious(value);
	const onChange = useCallback((newValue: string) => {
		consumerOnChange?.(newValue);
		setInternalValue(newValue);
	}, [consumerOnChange]);
	const regexp = useMemo(
		() => (pattern ? (typeof pattern === 'string' ? new RegExp(pattern) : pattern) : null),
		[pattern],
	);

	const inputRef = useRef<HTMLInputElement | null>(null);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const composedInputRef = useMemo(() => [inputRef, ref ?? null], [ref]);
	const initialLoadRef = useRef({
		value,
		onChange,
		isIOS: typeof window !== 'undefined' &&
			window.CSS?.supports?.('-webkit-touch-callout', 'none') === true,
	});
	const inputMetadataRef = useRef<{
		prev: [number | null, number | null, 'none' | 'forward' | 'backward' | null];
	}>({ prev: [null, null, null] });
	const syncSelectionRef = useRef<(() => void) | null>(null);

	const [isHoveringInput, setIsHoveringInput] = useState(false);
	const [isFocused, setIsFocused] = useState(false);
	const [mirrorSelectionStart, setMirrorSelectionStart] = useState<number | null>(null);
	const [mirrorSelectionEnd, setMirrorSelectionEnd] = useState<number | null>(null);

	useEffect(() => {
		const input = inputRef.current;
		const container = containerRef.current;
		if (!input || !container || typeof document === 'undefined') return;
		const mountedInput = input;

		if (initialLoadRef.current.value !== input.value) {
			initialLoadRef.current.onChange(input.value);
		}

		inputMetadataRef.current.prev = [
			input.selectionStart,
			input.selectionEnd,
			input.selectionDirection,
		];

		function onDocumentSelectionChange() {
			if (document.activeElement !== mountedInput) {
				setMirrorSelectionStart(null);
				setMirrorSelectionEnd(null);
				return;
			}

			const selectionStart = mountedInput.selectionStart;
			const selectionEnd = mountedInput.selectionEnd;
			const selectionDirection = mountedInput.selectionDirection;
			const previous = inputMetadataRef.current.prev;
			let start = -1;
			let end = -1;
			let direction: 'forward' | 'backward' | 'none' | undefined;

			if (mountedInput.value.length !== 0 && selectionStart !== null && selectionEnd !== null) {
				const isSingleCaret = selectionStart === selectionEnd;
				const isInsertMode =
					selectionStart === mountedInput.value.length &&
						mountedInput.value.length < mountedInput.maxLength;
				if (isSingleCaret && !isInsertMode) {
					const caret = selectionStart;
					if (caret === 0) {
						start = 0;
						end = 1;
						direction = 'forward';
					} else if (caret === mountedInput.maxLength) {
						start = caret - 1;
						end = caret;
						direction = 'backward';
					} else if (mountedInput.maxLength > 1 && mountedInput.value.length > 1) {
						let offset = 0;
						if (previous[0] !== null && previous[1] !== null) {
							direction = caret < previous[1] ? 'backward' : 'forward';
							const wasPreviouslyInserting =
								previous[0] === previous[1] && previous[0] < mountedInput.maxLength;
							if (direction === 'backward' && !wasPreviouslyInserting) offset = -1;
						}
						start = offset + caret;
						end = offset + caret + 1;
					}
				}
				if (start !== -1 && end !== -1 && start !== end) {
					mountedInput.setSelectionRange(start, end, direction);
				}
			}

			const nextStart =
				start !== -1 ? start : selectionStart;
			const nextEnd =
				end !== -1 ? end : selectionEnd;
			setMirrorSelectionStart(nextStart);
			setMirrorSelectionEnd(nextEnd);
			inputMetadataRef.current.prev = [
				nextStart,
				nextEnd,
				direction ?? selectionDirection,
			];
		}

		document.addEventListener('selectionchange', onDocumentSelectionChange, { capture: true });
		syncSelectionRef.current = onDocumentSelectionChange;
		onDocumentSelectionChange();
		if (document.activeElement === input) setIsFocused(true);

		const releaseInputStyles = acquireInputStyles(nonce);
		const updateRootHeight = () => {
			container.style.setProperty('--root-height', `${input.clientHeight}px`);
		};
		updateRootHeight();
		const resizeObserver =
			typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateRootHeight);
		resizeObserver?.observe(input);

		return () => {
			syncSelectionRef.current = null;
			document.removeEventListener('selectionchange', onDocumentSelectionChange, {
				capture: true,
			});
			resizeObserver?.disconnect();
			releaseInputStyles();
		};
	}, []);

	useEffect(() => {
		const timeoutIds = syncTimeouts(() => {
			const input = inputRef.current;
			input?.dispatchEvent(new Event('input'));
			const start = input?.selectionStart;
			const end = input?.selectionEnd;
			const direction = input?.selectionDirection ?? null;
			if (start != null && end != null) {
				setMirrorSelectionStart(start);
				setMirrorSelectionEnd(end);
				inputMetadataRef.current.prev = [start, end, direction];
			}
		});
		return () => timeoutIds.forEach(clearTimeout);
	}, [value, isFocused]);

	useEffect(() => {
		if (
			previousValue !== undefined && value !== previousValue && previousValue.length < maxLength &&
				value.length === maxLength
		) {
			onComplete?.(value);
		}
	}, [maxLength, onComplete, previousValue, value]);

	const passwordManagerBadge = usePasswordManagerBadge(
		{
			containerRef,
			inputRef,
			pushPasswordManagerStrategy,
			isFocused,
		},
		PASSWORD_MANAGER_BADGE_SLOT,
	);

	const rootStyle = useMemo(
		() => ({
			position: 'relative' as const,
			cursor: inputProps.disabled ? 'default' : 'text',
			userSelect: 'none' as const,
			WebkitUserSelect: 'none' as const,
			pointerEvents: 'none' as const,
		}),
		[inputProps.disabled],
	);
	const inputStyle = useMemo(
		() => ({
			position: 'absolute' as const,
			inset: 0,
			width: passwordManagerBadge.willPushPWMBadge
				? `calc(100% + ${passwordManagerBadge.PWM_BADGE_SPACE_WIDTH})`
				: '100%',
			clipPath: passwordManagerBadge.willPushPWMBadge
				? `inset(0 ${passwordManagerBadge.PWM_BADGE_SPACE_WIDTH} 0 0)`
				: undefined,
			height: '100%',
			display: 'flex',
			textAlign,
			opacity: '1',
			color: 'transparent',
			pointerEvents: 'all' as const,
			background: 'transparent',
			caretColor: 'transparent',
			border: '0 solid transparent',
			outline: '0 solid transparent',
			boxShadow: 'none',
			lineHeight: '1',
			letterSpacing: '-.5em',
			fontSize: 'var(--root-height, 16px)',
			fontFamily: 'monospace',
			fontVariantNumeric: 'tabular-nums',
		}),
		[
			passwordManagerBadge.PWM_BADGE_SPACE_WIDTH,
			passwordManagerBadge.willPushPWMBadge,
			textAlign,
		],
	);

	const contextValue = useMemo<RenderProps>(() => {
		return {
			slots: Array.from({ length: maxLength }).map((_, slotIndex) => {
				const isActive =
					isFocused && mirrorSelectionStart !== null && mirrorSelectionEnd !== null &&
						(mirrorSelectionStart === mirrorSelectionEnd && slotIndex === mirrorSelectionStart ||
							slotIndex >= mirrorSelectionStart && slotIndex < mirrorSelectionEnd);
				const char = value[slotIndex] ?? null;
				const placeholderChar =
					value[0] !== undefined ? null : placeholder?.[slotIndex] ?? null;
				return {
					char,
					placeholderChar,
					isActive,
					hasFakeCaret: isActive && char === null,
				};
			}),
			isFocused,
			isHovering: !inputProps.disabled && isHoveringInput,
		};
	}, [
		isFocused,
		isHoveringInput,
		maxLength,
		mirrorSelectionEnd,
		mirrorSelectionStart,
		inputProps.disabled,
		placeholder,
		value,
	]);

	let renderedChildren: OctaneNode;
	if (render) {
		renderedChildren = render(contextValue);
	} else {
		renderedChildren = <OTPInputContext.Provider
			value={contextValue}
		>{children}</OTPInputContext.Provider>;
	}
	const noScriptStyle =
		noScriptCSSFallback === null ? null : createElement('style', null, noScriptCSSFallback);

	return <>
		@if (noScriptStyle !== null) {
			<noscript>{noScriptStyle}</noscript>
		}
		<div
			ref={containerRef}
			data-input-otp-container=""
			translate="no"
			style={rootStyle}
			className={containerClassName}
		>
			{renderedChildren}
			<div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
				<input
					{...inputProps}
					autoComplete={autoComplete || 'one-time-code'}
					data-input-otp=""
					data-input-otp-placeholder-shown={value.length === 0 || undefined}
					data-input-otp-mss={mirrorSelectionStart}
					data-input-otp-mse={mirrorSelectionEnd}
					inputMode={inputMode}
					pattern={regexp ? regexp.source : undefined}
					aria-placeholder={placeholder}
					style={inputStyle}
					maxLength={maxLength}
					spellCheck={spellCheck ?? false}
					suppressHydrationWarning
					value={value}
					ref={composedInputRef}
					onInput={(event) => {
						consumerOnInput?.(event);
						const newValue = event.currentTarget.value.slice(0, maxLength);
						if (newValue.length > 0 && regexp && !regexp.test(newValue)) {
							event.preventDefault();
							event.currentTarget.value = value;
							return;
						}
						const hasDeleted = newValue.length < value.length;
						if (hasDeleted && typeof document !== 'undefined') {
							document.dispatchEvent(new Event('selectionchange'));
						}
						onChange(newValue);
						if (!hasDeleted) {
							syncSelectionRef.current?.();
						}
					}}
					onPaste={(event) => {
						const input = inputRef.current;
						if (
							input && event.clipboardData && (pasteTransformer || initialLoadRef.current.isIOS)
						) {
							const pasted = event.clipboardData.getData('text/plain');
							const content =
								pasteTransformer ? pasteTransformer(pasted) : pasted;
							event.preventDefault();
							const start = input.selectionStart ?? value.length;
							const end = input.selectionEnd ?? start;
							const uncapped = value.slice(0, start) + content + value.slice(end);
							const newValue = uncapped.slice(0, maxLength);
							if (newValue.length === 0 || !regexp || regexp.test(newValue)) {
								input.value = newValue;
								onChange(newValue);
								const nextStart = Math.min(newValue.length, maxLength - 1);
								const nextEnd = newValue.length;
								input.setSelectionRange(nextStart, nextEnd);
								setMirrorSelectionStart(nextStart);
								setMirrorSelectionEnd(nextEnd);
							}
						}
						consumerOnPaste?.(event);
					}}
					onMouseOver={(event) => {
						setIsHoveringInput(true);
						consumerOnMouseOver?.(event);
					}}
					onMouseLeave={(event) => {
						setIsHoveringInput(false);
						consumerOnMouseLeave?.(event);
					}}
					onFocus={(event) => {
						const input = inputRef.current;
						if (input) {
							const start = Math.min(input.value.length, maxLength - 1);
							const end = input.value.length;
							input.setSelectionRange(start, end);
							setMirrorSelectionStart(start);
							setMirrorSelectionEnd(end);
						}
						setIsFocused(true);
						consumerOnFocus?.(event);
					}}
					onBlur={(event) => {
						setIsFocused(false);
						consumerOnBlur?.(event);
					}}
				/>
			</div>
		</div>
	</>;
}

OTPInput.displayName = 'Input';

let ownedInputStyle: HTMLStyleElement | null = null;
let inputStyleUsers = 0;

function acquireInputStyles(nonce?: string): () => void {
	if (ownedInputStyle && !ownedInputStyle.isConnected) {
		// Forget the removed node so it can be reinstalled, but retain the count:
		// mounted inputs still own their release callbacks.
		ownedInputStyle = null;
	}
	const existing = document.getElementById('input-otp-style');
	if (existing && existing !== ownedInputStyle) return () => {};
	inputStyleUsers++;
	if (!ownedInputStyle) installInputStyles(nonce);
	return () => {
		inputStyleUsers--;
		if (inputStyleUsers === 0) {
			ownedInputStyle?.remove();
			ownedInputStyle = null;
		}
	};
}

function installInputStyles(nonce?: string): void {
	const style = document.createElement('style');
	style.id = 'input-otp-style';
	if (nonce) style.setAttribute('nonce', nonce);
	document.head.appendChild(style);
	ownedInputStyle = style;
	if (!style.sheet) return;
	const autofillStyles = 'background: transparent !important; color: transparent !important; border-color: transparent !important; opacity: 0 !important; box-shadow: none !important; -webkit-box-shadow: none !important; -webkit-text-fill-color: transparent !important;';
	safeInsertRule(
		style.sheet,
		'[data-input-otp]::selection { background: transparent !important; color: transparent !important; }',
	);
	safeInsertRule(style.sheet, `[data-input-otp]:autofill { ${autofillStyles} }`);
	safeInsertRule(style.sheet, `[data-input-otp]:-webkit-autofill { ${autofillStyles} }`);
	safeInsertRule(
		style.sheet,
		'@supports (-webkit-touch-callout: none) { [data-input-otp] { letter-spacing: -.6em !important; font-weight: 100 !important; font-stretch: ultra-condensed; font-optical-sizing: none !important; left: -1px !important; right: 1px !important; } }',
	);
	safeInsertRule(style.sheet, '[data-input-otp] + * { pointer-events: all !important; }');
}

function safeInsertRule(sheet: CSSStyleSheet, rule: string): void {
	try {
		sheet.insertRule(rule);
	} catch {
		console.warn('input-otp could not insert CSS rule:', rule);
	}
}

const NOSCRIPT_CSS_FALLBACK = `
[data-input-otp] {
  --nojs-bg: white !important;
  --nojs-fg: black !important;
  background-color: var(--nojs-bg) !important;
  color: var(--nojs-fg) !important;
  caret-color: var(--nojs-fg) !important;
  letter-spacing: .25em !important;
  text-align: center !important;
  border: 1px solid var(--nojs-fg) !important;
  border-radius: 4px !important;
  width: 100% !important;
}
@media (prefers-color-scheme: dark) {
  [data-input-otp] {
    --nojs-bg: black !important;
    --nojs-fg: white !important;
  }
}`;
