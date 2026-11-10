import type { Book, LibraryServer } from './library.ts';

/** What every journey drives. Each design keeps the screen's views current its own way. */
export interface Design {
	readonly name: string;
	/** Show every view: from the network, or from `persisted` when given. */
	start(persisted?: string): Promise<void>;
	/** The rows each view shows right now. */
	views(): Map<string, readonly Book[]>;
	/** Called after the views change. */
	onChange(listener: () => void): () => void;
	add(title: string): Promise<unknown>;
	update(id: string, patch: Partial<Book>): Promise<unknown>;
	/** What this design would write to storage to start the next session. */
	persist(): Promise<string>;
	/** Bytes posted between the UI and a worker, both directions. */
	workerBytes(): number;
	close(): void;
}

export type DesignFactory = (server: LibraryServer) => Design;
