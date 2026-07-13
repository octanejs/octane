import { createContext } from 'octane';
import type { DragDropManager } from '@dnd-kit/dom';

export const DragDropContext = createContext<DragDropManager | null>(null);
