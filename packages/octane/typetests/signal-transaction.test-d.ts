import { createScope, type SignalChange, type SignalTransaction } from 'octane/signals';

const scope = createScope({ scopeKey: 'transaction-types' });
const count$ = scope.signal$('count', 1);
const transaction: SignalTransaction<string> = scope.transaction(() => {
	count$.set(2);
	return 'done';
});
const value: string = transaction.value;
const changes: readonly SignalChange[] = transaction.changes;
const previous: unknown = changes[0]!.previous;
transaction.undo();
transaction.redo();
// @ts-expect-error A transaction is synchronous.
scope.transaction(async () => count$.set(3));
void [value, previous];
