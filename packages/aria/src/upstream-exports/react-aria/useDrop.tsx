/** @jsxImportSource octane */
// Ported from adobe/react-spectrum@1c84a49a1faf50b571c84e00bcf9c60b22ddd03e (packages/react-aria/exports/useDrop.ts).
/*
 * Copyright 2020 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

export type { DropOptions, DropResult } from '../../dnd/useDrop';
export { useDrop } from '../../dnd/useDrop';
export {
	DIRECTORY_DRAG_TYPE,
	isDirectoryDropItem,
	isFileDropItem,
	isTextDropItem,
} from '../../dnd/utils';
export type {
	DirectoryDropItem,
	DropEnterEvent,
	DropEvent,
	DropExitEvent,
	DropItem,
	DropMoveEvent,
	DropOperation,
	FileDropItem,
	TextDropItem,
} from '@react-types/shared';
