import { fromEvent } from "file-selector";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useReducer, useRef } from "react";
import attrAccept from "attr-accept";
import { Fragment, jsx } from "react/jsx-runtime";
//#region src/utils/index.ts
const accepts = typeof attrAccept === "function" ? attrAccept : attrAccept.default;
const FILE_INVALID_TYPE = "file-invalid-type";
const FILE_TOO_LARGE = "file-too-large";
const FILE_TOO_SMALL = "file-too-small";
const TOO_MANY_FILES = "too-many-files";
let ErrorCode = /* @__PURE__ */ function(ErrorCode) {
	ErrorCode["FileInvalidType"] = "file-invalid-type";
	ErrorCode["FileTooLarge"] = "file-too-large";
	ErrorCode["FileTooSmall"] = "file-too-small";
	ErrorCode["TooManyFiles"] = "too-many-files";
	return ErrorCode;
}({});
function getInvalidTypeRejectionErr(accept = "") {
	const acceptArr = accept.split(",");
	const msg = acceptArr.length > 1 ? `one of ${acceptArr.join(", ")}` : acceptArr[0];
	return {
		code: FILE_INVALID_TYPE,
		message: `File type must be ${msg}`
	};
}
const FILE_SIZE_UNITS = [
	"KB",
	"MB",
	"GB",
	"TB",
	"PB"
];
/**
* Format a byte count into a human-readable string, e.g. `1111` -> `1.08 KB`.
* Values below 1 KB are kept in bytes to preserve the singular/plural wording.
*/
function formatBytes(bytes) {
	if (bytes < 1024) return `${bytes} ${bytes === 1 ? "byte" : "bytes"}`;
	let size = bytes / 1024;
	let unitIndex = 0;
	while (size >= 1024 && unitIndex < FILE_SIZE_UNITS.length - 1) {
		size /= 1024;
		unitIndex++;
	}
	return `${Number(size.toFixed(2))} ${FILE_SIZE_UNITS[unitIndex]}`;
}
function getTooLargeRejectionErr(maxSize) {
	return {
		code: FILE_TOO_LARGE,
		message: `File is larger than ${formatBytes(maxSize)}`
	};
}
function getTooSmallRejectionErr(minSize) {
	return {
		code: FILE_TOO_SMALL,
		message: `File is smaller than ${formatBytes(minSize)}`
	};
}
const TOO_MANY_FILES_REJECTION = {
	code: TOO_MANY_FILES,
	message: "Too many files"
};
/**
* Check if the given file is a DataTransferItem with an empty type.
*
* During drag events, browsers may return DataTransferItem objects instead of File objects.
* Some browsers (e.g., Chrome) return an empty MIME type for certain file types (like .md files)
* on DataTransferItem during drag events, even though the type is correctly set during drop.
*/
function isDataTransferItemWithEmptyType(file) {
	return file.type === "" && typeof file.getAsFile === "function";
}
/**
* Check if file is accepted.
*
* Firefox versions prior to 53 return a bogus MIME type for every file drag,
* so dragovers with that MIME type will always be accepted.
*
* Chrome/other browsers may return an empty MIME type for files during drag events,
* so we accept those as well (we'll validate properly on drop).
*/
function fileAccepted(file, accept) {
	const isAcceptable = file.type === "application/x-moz-file" || accepts(file, accept ?? "") || isDataTransferItemWithEmptyType(file);
	return [isAcceptable, isAcceptable ? null : getInvalidTypeRejectionErr(accept)];
}
function fileMatchSize(file, minSize, maxSize) {
	if (isDefined(file.size)) {
		if (isDefined(minSize) && isDefined(maxSize)) {
			if (file.size > maxSize) return [false, getTooLargeRejectionErr(maxSize)];
			if (file.size < minSize) return [false, getTooSmallRejectionErr(minSize)];
		} else if (isDefined(minSize) && file.size < minSize) return [false, getTooSmallRejectionErr(minSize)];
		else if (isDefined(maxSize) && file.size > maxSize) return [false, getTooLargeRejectionErr(maxSize)];
	}
	return [true, null];
}
function isDefined(value) {
	return value !== void 0 && value !== null;
}
/**
* Check if a value is thenable (Promise-like), used to tell a synchronous validator result from an
* asynchronous one.
*/
function isThenable(value) {
	return value != null && typeof value.then === "function";
}
/**
* Classify a set of dragged files for the `isDragAccept`/`isDragReject`/`isDragUnknown` states.
*
* During `dragenter`/`dragover` the browser only exposes `DataTransferItem`s, which carry a MIME
* `type` but no file name, extension or size (see https://html.spec.whatwg.org/multipage/dnd.html#dndevents).
* So the drag-time check is deliberately optimistic about anything it can't see:
*
* - The custom `validator` is **never** run here. It is typed `(file: File) => ...` and users
*   routinely read `file.name`/`file.size`, which are `undefined` on a `DataTransferItem` - running
*   it would throw and abort the whole drag handler (leaving `isDragActive` stuck at `false`).
*   See https://github.com/react-dropzone/react-dropzone/issues/1408
* - When a `validator` is configured we therefore can't promise the files are acceptable, so the
*   verdict is `unknown` rather than a misleading `reject` (or a premature `accept`).
*   See https://github.com/react-dropzone/react-dropzone/issues/1244
*
* The full check (including the `validator`) still runs on drop in {@link fileAccepted}/`setFiles`.
*/
function getDragVerdict({ files, accept, minSize, maxSize, multiple, maxFiles = 0, validator }) {
	if (!multiple && files.length > 1 || multiple && maxFiles >= 1 && files.length > maxFiles) return "reject";
	if (files.some((file) => {
		const [accepted] = fileAccepted(file, accept);
		const [sizeMatch] = fileMatchSize(file, minSize, maxSize);
		return !accepted || !sizeMatch;
	})) return "reject";
	return validator ? "unknown" : "accept";
}
function isPropagationStopped(event) {
	if (typeof event.isPropagationStopped === "function") return event.isPropagationStopped();
	else if (typeof event.cancelBubble !== "undefined") return event.cancelBubble;
	return false;
}
function isEvtWithFiles(event) {
	const dataTransfer = event.dataTransfer ?? event.clipboardData;
	if (!dataTransfer) return !!event.target && !!event.target.files;
	return Array.prototype.some.call(dataTransfer.types, (type) => type === "Files" || type === "application/x-moz-file") || Array.prototype.some.call(dataTransfer.items ?? [], isKindFile);
}
function isKindFile(item) {
	return typeof item === "object" && item !== null && item.kind === "file";
}
function onDocumentDragOver(event) {
	event.preventDefault();
}
function isIe(userAgent) {
	return userAgent.indexOf("MSIE") !== -1 || userAgent.indexOf("Trident/") !== -1;
}
function isEdge(userAgent) {
	return userAgent.indexOf("Edge/") !== -1;
}
function isIeOrEdge(userAgent = window.navigator.userAgent) {
	return isIe(userAgent) || isEdge(userAgent);
}
/**
* This is intended to be used to compose event handlers.
* They are executed in order until one of them calls `event.isPropagationStopped()`.
* Note that the check is done on the first invoke too,
* meaning that if propagation was stopped before invoking the fns,
* no handlers will be executed.
*/
function composeEventHandlers(...fns) {
	return (event, ...args) => fns.some((fn) => {
		if (!isPropagationStopped(event) && fn) fn(event, ...args);
		return isPropagationStopped(event);
	});
}
/**
* canUseFileSystemAccessAPI checks if the File System Access API is supported by the browser.
*/
function canUseFileSystemAccessAPI() {
	return "showOpenFilePicker" in window;
}
/**
* Coerce an `accept` extension value to an array. `window.showOpenFilePicker` allows a single
* extension string as well as an array, so we accept both and normalize to an array. Anything
* else (a malformed value) collapses to an empty list.
*/
function toExtensions(ext) {
	if (Array.isArray(ext)) return ext;
	if (typeof ext === "string") return [ext];
	return [];
}
/**
* Normalize either `accept` form to the internal array of `{description, accept}` groups.
*
* - The object form (`{mime: ext}`) becomes a single group; its `description` (which the object
*   form can't express) is derived from the extensions like any other group.
* - The array form is passed through; entries missing an `accept` map are dropped.
*
* In both cases a missing `description` is filled in later from the group's extensions (see
* {@link describeAccept}), so the picker always gets the non-empty description it requires
* (https://crbug.com/1264708). Returns `undefined` when no `accept` is provided.
*/
function normalizeAcceptGroups(accept) {
	if (!isDefined(accept)) return;
	if (Array.isArray(accept)) return accept.filter((group) => isDefined(group) && isDefined(group.accept));
	return [{ accept }];
}
/**
* Build a human-readable label for a picker group from its (validated) accept map, used when the
* caller doesn't supply a `description`. Prefer the file extensions, fall back to the MIME types,
* then to a generic label - `showOpenFilePicker` requires a non-empty description (crbug 1264708).
*/
function describeAccept(accept) {
	const extensions = [];
	const mimeTypes = Object.keys(accept);
	for (const ext of Object.values(accept)) for (const e of toExtensions(ext)) if (!extensions.includes(e)) extensions.push(e);
	if (extensions.length > 0) return extensions.join(", ");
	if (mimeTypes.length > 0) return mimeTypes.join(", ");
	return "Files";
}
/**
* Merge every `accept` group into a single MIME-type -> extensions map. Duplicate MIME keys union
* their extensions. This flattened map drives the native `<input accept>` attribute and the
* drag/drop validators, which have no concept of groups or descriptions.
*/
function flattenAccept(accept) {
	const groups = normalizeAcceptGroups(accept);
	if (!isDefined(groups)) return;
	const merged = {};
	for (const group of groups) for (const [mimeType, ext] of Object.entries(group.accept)) {
		const existing = merged[mimeType] ?? (merged[mimeType] = []);
		for (const e of toExtensions(ext)) if (!existing.includes(e)) existing.push(e);
	}
	return merged;
}
/**
* Convert the `{accept}` dropzone prop to the `{types}` option for showOpenFilePicker.
*
* Each group becomes one filter row in the picker. Invalid MIME types / extensions are dropped
* with a warning; a group left with no valid entries is omitted entirely (showOpenFilePicker
* rejects an empty `accept`). Returns `undefined` when nothing valid remains.
*/
function pickerOptionsFromAccept(accept) {
	const groups = normalizeAcceptGroups(accept);
	if (!isDefined(groups)) return;
	const options = groups.map((group) => {
		const acceptForPicker = Object.entries(group.accept).filter(([mimeType, ext]) => {
			let ok = true;
			if (!isMIMEType(mimeType)) {
				console.warn(`Skipped "${mimeType}" because it is not a valid MIME type. Check https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Common_types for a list of valid MIME types.`);
				ok = false;
			}
			if (!(Array.isArray(ext) || typeof ext === "string") || !toExtensions(ext).every(isExt)) {
				console.warn(`Skipped "${mimeType}" because an invalid file extension was provided.`);
				ok = false;
			}
			return ok;
		}).reduce((agg, [mimeType, ext]) => {
			agg[mimeType] = toExtensions(ext);
			return agg;
		}, {});
		return {
			description: isDefined(group.description) && group.description !== "" ? group.description : describeAccept(acceptForPicker),
			accept: acceptForPicker
		};
	}).filter((option) => Object.keys(option.accept).length > 0);
	return options.length > 0 ? options : void 0;
}
/**
* Convert the `{accept}` dropzone prop to a comma-separated accept attribute string.
*
* When `omitWildcardMimeTypesWithExtensions` is set, a wildcard MIME type (e.g. `image/*`)
* that is paired with explicit extensions is dropped in favour of those extensions. The
* accept attribute is an OR list, so leaving `image/*` in would make both the native file
* picker and the drop-time validator accept ANY file of that type, ignoring the extension
* restriction. The drag-time `isDragAccept` check keeps the wildcard because file names
* (and therefore extensions) aren't readable during a drag.
*
* See https://github.com/react-dropzone/react-dropzone/issues/1220
*/
function acceptPropAsAcceptAttr(accept, { omitWildcardMimeTypesWithExtensions = false } = {}) {
	if (isDefined(accept)) return Object.entries(accept).reduce((a, [mimeType, extVal]) => {
		const ext = toExtensions(extVal);
		if (omitWildcardMimeTypesWithExtensions && isMIMETypeWildcard(mimeType) && ext.some(isExt)) a.push(...ext);
		else a.push(mimeType, ...ext);
		return a;
	}, []).filter((v) => isMIMEType(v) || isExt(v)).join(",");
}
/**
* Check if v is an exception caused by aborting a request (e.g window.showOpenFilePicker()).
*/
function isAbort(v) {
	return v instanceof DOMException && (v.name === "AbortError" || v.code === v.ABORT_ERR);
}
/**
* Check if v is a security error.
*/
function isSecurityError(v) {
	return v instanceof DOMException && (v.name === "SecurityError" || v.code === v.SECURITY_ERR);
}
/**
* Check if v is a "not allowed" error.
*
* Some browsers/configurations block `window.showOpenFilePicker()` outright and reject with a
* `NotAllowedError` instead of showing the picker (e.g. Microsoft Edge for Business, or other
* restrictive enterprise/security policies). We treat this like a security error and fall back
* to the native `<input>`. See https://github.com/react-dropzone/react-dropzone/issues/1429
*/
function isNotAllowedError(v) {
	return v instanceof DOMException && v.name === "NotAllowedError";
}
/**
* Check if v is a MIME type string.
*/
function isMIMEType(v) {
	return v === "audio/*" || v === "video/*" || v === "image/*" || v === "text/*" || v === "application/*" || /\w+\/[-+.\w]+/g.test(v);
}
/**
* Check if v is a wildcard MIME type (e.g. `image/*`).
*/
function isMIMETypeWildcard(v) {
	return v.endsWith("/*");
}
/**
* Check if v is a file extension.
*/
function isExt(v) {
	return /^.*\.[\w]+$/.test(v);
}
//#endregion
//#region src/index.tsx
/**
* Convenience wrapper component for the `useDropzone` hook
*
* ```jsx
* <Dropzone>
*   {({getRootProps, getInputProps}) => (
*     <div {...getRootProps()}>
*       <input {...getInputProps()} />
*       <p>Drag 'n' drop some files here, or click to select files</p>
*     </div>
*   )}
* </Dropzone>
* ```
*/
const Dropzone = forwardRef(({ children, ...params }, ref) => {
	const { open, ...props } = useDropzone(params);
	useImperativeHandle(ref, () => ({ open }), [open]);
	return /* @__PURE__ */ jsx(Fragment, { children: children?.({
		...props,
		open
	}) });
});
Dropzone.displayName = "Dropzone";
const initialState = {
	isFocused: false,
	isFileDialogActive: false,
	isDragActive: false,
	isDragAccept: false,
	isDragReject: false,
	isDragUnknown: false,
	isDragGlobal: false,
	isProcessing: false,
	acceptedFiles: [],
	fileRejections: []
};
/**
* A React hook that creates a drag 'n' drop area.
*
* ```jsx
* function MyDropzone(props) {
*   const {getRootProps, getInputProps} = useDropzone({
*     onDrop: acceptedFiles => {
*       // do something with the File objects, e.g. upload to some server
*     }
*   });
*   return (
*     <div {...getRootProps()}>
*       <input {...getInputProps()} />
*       <p>Drag and drop some files here, or click to select files</p>
*     </div>
*   )
* }
* ```
*/
function useDropzone(props = {}) {
	const { accept, disabled = false, getFilesFromEvent = fromEvent, maxSize = Number.POSITIVE_INFINITY, minSize = 0, multiple = true, maxFiles = 0, onDragEnter, onDragLeave, onDragOver, onDrop, onDropAccepted, onDropRejected, onFileDialogCancel, onFileDialogOpen, useFsAccessApi = false, autoFocus = false, preventDropOnDocument = true, noClick = false, noKeyboard = false, noDrag = false, noDragEventsBubbling = false, noPaste = false, onError, validator, getErrorMessage } = props;
	const flatAccept = useMemo(() => flattenAccept(accept), [accept]);
	const acceptAttr = useMemo(() => acceptPropAsAcceptAttr(flatAccept), [flatAccept]);
	const inputAcceptAttr = useMemo(() => acceptPropAsAcceptAttr(flatAccept, { omitWildcardMimeTypesWithExtensions: true }), [flatAccept]);
	const pickerTypes = useMemo(() => pickerOptionsFromAccept(accept), [accept]);
	const onFileDialogOpenCb = useMemo(() => typeof onFileDialogOpen === "function" ? onFileDialogOpen : noop, [onFileDialogOpen]);
	const onFileDialogCancelCb = useMemo(() => typeof onFileDialogCancel === "function" ? onFileDialogCancel : noop, [onFileDialogCancel]);
	const rootRef = useRef(null);
	const inputRef = useRef(null);
	const [state, dispatch] = useReducer(reducer, initialState);
	const { isFocused, isFileDialogActive } = state;
	const isFileDialogActiveRef = useRef(isFileDialogActive);
	isFileDialogActiveRef.current = isFileDialogActive;
	const processingAbortRef = useRef(null);
	const beginProcessing = useCallback(() => {
		processingAbortRef.current?.abort();
		const controller = new AbortController();
		processingAbortRef.current = controller;
		dispatch({
			type: "setProcessing",
			isProcessing: true
		});
		return controller.signal;
	}, []);
	const endProcessing = useCallback((signal) => {
		if (!signal.aborted) dispatch({
			type: "setProcessing",
			isProcessing: false
		});
	}, []);
	const fsAccessApiWorksRef = useRef(typeof window !== "undefined" && window.isSecureContext && useFsAccessApi && canUseFileSystemAccessAPI());
	const onWindowFocus = () => {
		if (!fsAccessApiWorksRef.current && isFileDialogActive) setTimeout(() => {
			if (inputRef.current) {
				const { files } = inputRef.current;
				if (!files?.length) {
					dispatch({ type: "closeDialog" });
					onFileDialogCancelCb();
				}
			}
		}, 300);
	};
	useEffect(() => {
		window.addEventListener("focus", onWindowFocus, false);
		return () => {
			window.removeEventListener("focus", onWindowFocus, false);
		};
	}, [
		inputRef,
		isFileDialogActive,
		onFileDialogCancelCb,
		fsAccessApiWorksRef
	]);
	const dragTargetsRef = useRef([]);
	const globalDragTargetsRef = useRef([]);
	const onDocumentDrop = (event) => {
		if (rootRef.current && event.target && rootRef.current.contains(event.target) && event.defaultPrevented) return;
		event.preventDefault();
		dragTargetsRef.current = [];
	};
	useEffect(() => {
		if (preventDropOnDocument) {
			document.addEventListener("dragover", onDocumentDragOver, false);
			document.addEventListener("drop", onDocumentDrop, false);
		}
		return () => {
			if (preventDropOnDocument) {
				document.removeEventListener("dragover", onDocumentDragOver);
				document.removeEventListener("drop", onDocumentDrop);
			}
		};
	}, [rootRef, preventDropOnDocument]);
	useEffect(() => {
		const onDocumentDragEnter = (event) => {
			if (event.target) globalDragTargetsRef.current = [...globalDragTargetsRef.current, event.target];
			if (isEvtWithFiles(event)) dispatch({
				isDragGlobal: true,
				type: "setDragGlobal"
			});
		};
		const onDocumentDragLeave = (event) => {
			globalDragTargetsRef.current = globalDragTargetsRef.current.filter((el) => el !== event.target && el !== null);
			if (globalDragTargetsRef.current.length > 0) return;
			dispatch({
				isDragGlobal: false,
				type: "setDragGlobal"
			});
		};
		const onDocumentDragEnd = () => {
			globalDragTargetsRef.current = [];
			dispatch({
				isDragGlobal: false,
				type: "setDragGlobal"
			});
		};
		const onDocumentDropGlobal = () => {
			globalDragTargetsRef.current = [];
			dispatch({
				isDragGlobal: false,
				type: "setDragGlobal"
			});
		};
		document.addEventListener("dragenter", onDocumentDragEnter, false);
		document.addEventListener("dragleave", onDocumentDragLeave, false);
		document.addEventListener("dragend", onDocumentDragEnd, false);
		document.addEventListener("drop", onDocumentDropGlobal, false);
		return () => {
			document.removeEventListener("dragenter", onDocumentDragEnter);
			document.removeEventListener("dragleave", onDocumentDragLeave);
			document.removeEventListener("dragend", onDocumentDragEnd);
			document.removeEventListener("drop", onDocumentDropGlobal);
		};
	}, [rootRef]);
	useEffect(() => {
		if (!disabled && autoFocus && rootRef.current) rootRef.current.focus();
		return () => {};
	}, [
		rootRef,
		autoFocus,
		disabled
	]);
	const onErrCb = useCallback((e) => {
		if (onError) onError(e);
		else console.error(e);
	}, [onError]);
	const onDragEnterCb = useCallback((event) => {
		event.preventDefault();
		event.persist?.();
		stopPropagation(event);
		if (isFileDialogActiveRef.current) return;
		dragTargetsRef.current = [...dragTargetsRef.current, event.target];
		if (isEvtWithFiles(event)) Promise.resolve(getFilesFromEvent(event)).then((files) => {
			if (isPropagationStopped(event) && !noDragEventsBubbling) return;
			const verdict = files.length > 0 ? getDragVerdict({
				files,
				accept: acceptAttr,
				minSize,
				maxSize,
				multiple,
				maxFiles,
				validator
			}) : null;
			dispatch({
				isDragAccept: verdict === "accept",
				isDragReject: verdict === "reject",
				isDragUnknown: verdict === "unknown",
				isDragActive: true,
				type: "setDraggedFiles"
			});
			if (onDragEnter) onDragEnter(event);
		}).catch((e) => onErrCb(e));
	}, [
		getFilesFromEvent,
		onDragEnter,
		onErrCb,
		noDragEventsBubbling,
		acceptAttr,
		minSize,
		maxSize,
		multiple,
		maxFiles,
		validator
	]);
	const onDragOverCb = useCallback((event) => {
		event.preventDefault();
		event.persist?.();
		stopPropagation(event);
		if (isFileDialogActiveRef.current) return false;
		const hasFiles = isEvtWithFiles(event);
		if (hasFiles && event.dataTransfer) try {
			event.dataTransfer.dropEffect = "copy";
		} catch {}
		if (hasFiles && onDragOver) onDragOver(event);
		return false;
	}, [onDragOver, noDragEventsBubbling]);
	const onDragLeaveCb = useCallback((event) => {
		event.preventDefault();
		event.persist?.();
		stopPropagation(event);
		const targets = dragTargetsRef.current.filter((target) => rootRef.current?.contains(target));
		const targetIdx = targets.indexOf(event.target);
		if (targetIdx !== -1) targets.splice(targetIdx, 1);
		dragTargetsRef.current = targets;
		if (targets.length > 0) return;
		dispatch({
			type: "setDraggedFiles",
			isDragActive: false,
			isDragAccept: false,
			isDragReject: false,
			isDragUnknown: false
		});
		if (isEvtWithFiles(event) && onDragLeave) onDragLeave(event);
	}, [
		rootRef,
		onDragLeave,
		noDragEventsBubbling
	]);
	const setFiles = useCallback(async (files, event, signal) => {
		const localizeError = (error, file) => getErrorMessage ? {
			...error,
			message: getErrorMessage(error, file)
		} : error;
		const commit = (results) => {
			const acceptedFiles = [];
			const fileRejections = [];
			results.forEach(({ file, accepted, acceptError, sizeMatch, sizeError, customErrors }) => {
				if (accepted && sizeMatch && !customErrors) acceptedFiles.push(file);
				else {
					let errors = [acceptError, sizeError];
					if (customErrors) errors = errors.concat(customErrors);
					fileRejections.push({
						file,
						errors: errors.filter((e) => e != null).map((error) => localizeError(error, file))
					});
				}
			});
			const acceptedFilesLimit = multiple ? maxFiles >= 1 ? maxFiles : Number.POSITIVE_INFINITY : 1;
			if (acceptedFiles.length > acceptedFilesLimit) acceptedFiles.splice(acceptedFilesLimit).forEach((file) => {
				fileRejections.push({
					file,
					errors: [localizeError(TOO_MANY_FILES_REJECTION, file)]
				});
			});
			dispatch({
				acceptedFiles,
				fileRejections,
				type: "setFiles"
			});
			if (onDrop) onDrop(acceptedFiles, fileRejections, event);
			if (fileRejections.length > 0 && onDropRejected) onDropRejected(fileRejections, event);
			if (acceptedFiles.length > 0 && onDropAccepted) onDropAccepted(acceptedFiles, event);
		};
		const pending = files.map((file) => {
			const [accepted, acceptError] = fileAccepted(file, inputAcceptAttr);
			const [sizeMatch, sizeError] = fileMatchSize(file, minSize, maxSize);
			return {
				file,
				accepted,
				acceptError,
				sizeMatch,
				sizeError,
				customErrors: validator ? validator(file) : null
			};
		});
		if (!pending.some(({ customErrors }) => isThenable(customErrors))) {
			commit(pending);
			return;
		}
		let results;
		try {
			results = await Promise.all(pending.map(async ({ customErrors, ...rest }) => ({
				...rest,
				customErrors: await customErrors
			})));
		} catch (e) {
			if (!signal.aborted) {
				endProcessing(signal);
				onErrCb(e);
			}
			return;
		}
		if (signal.aborted) return;
		commit(results);
	}, [
		dispatch,
		multiple,
		inputAcceptAttr,
		minSize,
		maxSize,
		maxFiles,
		onDrop,
		onDropAccepted,
		onDropRejected,
		validator,
		getErrorMessage,
		onErrCb,
		endProcessing
	]);
	const onDropCb = useCallback((event) => {
		event.preventDefault();
		event.persist?.();
		stopPropagation(event);
		dragTargetsRef.current = [];
		if (isFileDialogActiveRef.current && event.dataTransfer) return;
		dispatch({ type: "reset" });
		if (isEvtWithFiles(event)) {
			const signal = beginProcessing();
			Promise.resolve(getFilesFromEvent(event)).then((files) => {
				if (signal.aborted) return;
				if (isPropagationStopped(event) && !noDragEventsBubbling) {
					endProcessing(signal);
					return;
				}
				return setFiles(files, event, signal);
			}).catch((e) => {
				if (!signal.aborted) {
					endProcessing(signal);
					onErrCb(e);
				}
			});
		}
	}, [
		getFilesFromEvent,
		setFiles,
		onErrCb,
		noDragEventsBubbling,
		beginProcessing,
		endProcessing
	]);
	const onPasteCb = useCallback((event) => {
		if (!isEvtWithFiles(event)) return;
		event.preventDefault();
		event.persist?.();
		stopPropagation(event);
		const signal = beginProcessing();
		Promise.resolve(getFilesFromEvent(event)).then((files) => {
			if (signal.aborted) return;
			if (isPropagationStopped(event) && !noDragEventsBubbling) {
				endProcessing(signal);
				return;
			}
			return setFiles(files, event, signal);
		}).catch((e) => {
			if (!signal.aborted) {
				endProcessing(signal);
				onErrCb(e);
			}
		});
	}, [
		getFilesFromEvent,
		setFiles,
		onErrCb,
		noDragEventsBubbling,
		beginProcessing,
		endProcessing
	]);
	const openFileDialog = useCallback(() => {
		if (fsAccessApiWorksRef.current) {
			dispatch({ type: "openDialog" });
			onFileDialogOpenCb();
			const opts = {
				multiple,
				types: pickerTypes
			};
			let signal;
			window.showOpenFilePicker(opts).then((handles) => {
				signal = beginProcessing();
				return getFilesFromEvent(handles);
			}).then((files) => {
				dispatch({ type: "closeDialog" });
				if (signal.aborted) return;
				return setFiles(files, null, signal);
			}).catch((e) => {
				if (signal) endProcessing(signal);
				if (isAbort(e)) {
					onFileDialogCancelCb(e);
					dispatch({ type: "closeDialog" });
				} else if (isSecurityError(e) || isNotAllowedError(e)) {
					fsAccessApiWorksRef.current = false;
					if (inputRef.current) {
						inputRef.current.value = "";
						inputRef.current.click();
					} else onErrCb(/* @__PURE__ */ new Error("Cannot open the file picker because the https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API is not supported and no <input> was provided."));
				} else onErrCb(e);
			});
			return;
		}
		if (inputRef.current) {
			dispatch({ type: "openDialog" });
			onFileDialogOpenCb();
			inputRef.current.value = "";
			inputRef.current.click();
		}
	}, [
		dispatch,
		onFileDialogOpenCb,
		onFileDialogCancelCb,
		useFsAccessApi,
		setFiles,
		onErrCb,
		pickerTypes,
		multiple,
		beginProcessing,
		endProcessing
	]);
	const onKeyDownCb = useCallback((event) => {
		if (!rootRef.current?.isEqualNode(event.target)) return;
		if (event.key === " " || event.key === "Enter" || event.keyCode === 32 || event.keyCode === 13) {
			event.preventDefault();
			openFileDialog();
		}
	}, [rootRef, openFileDialog]);
	const onFocusCb = useCallback(() => {
		dispatch({ type: "focus" });
	}, []);
	const onBlurCb = useCallback(() => {
		dispatch({ type: "blur" });
	}, []);
	const onClickCb = useCallback(() => {
		if (noClick) return;
		if (isIeOrEdge()) setTimeout(openFileDialog, 0);
		else openFileDialog();
	}, [noClick, openFileDialog]);
	const composeHandler = (fn) => {
		return disabled ? null : fn;
	};
	const composeKeyboardHandler = (fn) => {
		return noKeyboard ? null : composeHandler(fn);
	};
	const composeDragHandler = (fn) => {
		return noDrag ? null : composeHandler(fn);
	};
	const composePasteHandler = (fn) => {
		return noPaste ? null : composeHandler(fn);
	};
	const stopPropagation = (event) => {
		if (noDragEventsBubbling) event.stopPropagation();
	};
	const getRootProps = useMemo(() => ({ refKey = "ref", role, onKeyDown, onFocus, onBlur, onClick, onDragEnter, onDragOver, onDragLeave, onDrop, onPaste, ...rest } = {}) => ({
		onKeyDown: composeKeyboardHandler(composeEventHandlers(onKeyDown, onKeyDownCb)),
		onFocus: composeKeyboardHandler(composeEventHandlers(onFocus, onFocusCb)),
		onBlur: composeKeyboardHandler(composeEventHandlers(onBlur, onBlurCb)),
		onClick: composeHandler(composeEventHandlers(onClick, onClickCb)),
		onDragEnter: composeDragHandler(composeEventHandlers(onDragEnter, onDragEnterCb)),
		onDragOver: composeDragHandler(composeEventHandlers(onDragOver, onDragOverCb)),
		onDragLeave: composeDragHandler(composeEventHandlers(onDragLeave, onDragLeaveCb)),
		onDrop: composeDragHandler(composeEventHandlers(onDrop, onDropCb)),
		onPaste: composePasteHandler(composeEventHandlers(onPaste, onPasteCb)),
		role: typeof role === "string" && role !== "" ? role : "presentation",
		[refKey]: rootRef,
		...!disabled && !noKeyboard ? { tabIndex: 0 } : {},
		...disabled ? { "aria-disabled": true } : {},
		...rest
	}), [
		rootRef,
		onKeyDownCb,
		onFocusCb,
		onBlurCb,
		onClickCb,
		onDragEnterCb,
		onDragOverCb,
		onDragLeaveCb,
		onDropCb,
		onPasteCb,
		noKeyboard,
		noDrag,
		noPaste,
		disabled
	]);
	const onInputElementClick = useCallback((event) => {
		event.stopPropagation();
	}, []);
	const getInputProps = useMemo(() => ({ refKey = "ref", onChange, onClick, ...rest } = {}) => {
		return {
			accept: inputAcceptAttr,
			multiple,
			type: "file",
			"aria-label": "file upload",
			style: {
				border: 0,
				display: "block",
				height: 0,
				margin: 0,
				opacity: 0,
				overflow: "hidden",
				padding: 0,
				width: 0
			},
			onChange: composeHandler(composeEventHandlers(onChange, onDropCb)),
			onClick: composeHandler(composeEventHandlers(onClick, onInputElementClick)),
			tabIndex: -1,
			[refKey]: inputRef,
			...rest
		};
	}, [
		inputRef,
		accept,
		multiple,
		onDropCb,
		disabled
	]);
	return {
		...state,
		isFocused: isFocused && !disabled,
		getRootProps,
		getInputProps,
		rootRef,
		inputRef,
		open: composeHandler(openFileDialog)
	};
}
function reducer(state, action) {
	switch (action.type) {
		case "focus": return {
			...state,
			isFocused: true
		};
		case "blur": return {
			...state,
			isFocused: false
		};
		case "openDialog": return {
			...initialState,
			isFileDialogActive: true
		};
		case "closeDialog": return {
			...state,
			isFileDialogActive: false
		};
		case "setDraggedFiles": return {
			...state,
			isDragActive: action.isDragActive,
			isDragAccept: action.isDragAccept,
			isDragReject: action.isDragReject,
			isDragUnknown: action.isDragUnknown
		};
		case "setProcessing": return {
			...state,
			isProcessing: action.isProcessing
		};
		case "setFiles": return {
			...state,
			acceptedFiles: action.acceptedFiles,
			fileRejections: action.fileRejections,
			isProcessing: false,
			isDragReject: false,
			isDragUnknown: false
		};
		case "setDragGlobal": return {
			...state,
			isDragGlobal: action.isDragGlobal
		};
		case "reset": return { ...initialState };
		default: return state;
	}
}
function noop() {}
//#endregion
export { ErrorCode, Dropzone as default, useDropzone };

//# sourceMappingURL=index.js.map