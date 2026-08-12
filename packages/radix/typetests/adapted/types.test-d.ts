// Adapted Octane type-surface counterpart for the pinned radix-ui root.
// Renames and descriptor adaptations are intentional; see UPSTREAM.md.
import {
	Accordion,
	OneTimePasswordField,
	PasswordToggleField,
	Slot,
	Slottable,
	Primitive,
} from '@octanejs/radix';

void Accordion;
void OneTimePasswordField;
void PasswordToggleField;
void Slot;
void Slottable;
void Primitive;

// Slot accepts an Octane element descriptor at a value/prop position.
const slotChild = null as unknown as Parameters<typeof Slot>[0];
void slotChild;
