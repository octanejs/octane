import { Tooltip } from "@base-ui/react/tooltip";
import { Dialog as DialogPrimitive } from "@octanejs/radix";
import { type DialogProps } from "@radix-ui/react-dialog";
import { Slot } from "@octanejs/radix";
import { useState, type ComponentProps, type ElementRef, type ComponentPropsWithoutRef, type Ref, descriptorChildren, type OctaneElement, type FC, type OctaneNode, type ChangeEvent } from "octane";
import { ReactCompat } from "octane/react";
// No Octane port of `@example/react-toast` exists, so its components render in React through ReactCompat.
import { Toaster, toast } from "@example/react-toast";

// Shapes from migrating Memos and T3 Code: shadcn-style fields whose rest
// props carry React's per-edit `onChange`, `forwardRef` type arguments,
// annotations that name the global `React` namespace without importing it,
// a component that hands its `children` to a `render` prop, a library with
// no Octane port, and shadcn's Radix components.

export function Input({ className, type, onChange, ...props }: ComponentProps<"input">) @{
  <input type={type} data-slot="input" className={className} onInput={onChange} {...props} />
}

export function Textarea({ className, onChange, ...props }: ComponentProps<"textarea">) @{
  <textarea
    data-slot="textarea"
    className={className}
    onInput={onChange}
    {...props}
  />
}

export const DialogHeader = ({ className, ref, ...props }: ComponentPropsWithoutRef<"div"> & { ref?: Ref<ElementRef<"div">> }) => @{ <div ref={ref} className={className} {...props} /> };

// Base UI clones the element `render` gets, which React passes as `children`.
const TimeTooltip = descriptorChildren(({ children, label }: { children: OctaneElement; label: string }) => @{
  <Tooltip.Root>
    <Tooltip.Trigger render={children} />
    <Tooltip.Popup>{label as string}</Tooltip.Popup>
  </Tooltip.Root>
});

export function MemoTime({ when, linked }: { when: string; linked: boolean }) @{
  <TimeTooltip label={when}>
    {linked ? <a href="#memo">{when}</a> : <span>{when}</span>}
  </TimeTooltip>
}

export const RenameDialog: FC<{ title: OctaneNode; onRename(name: string): void }> = ({
  title,
  onRename,
}) => @{
  const [note, setNote] = useState("");
  const handleNote = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setNote(e.currentTarget.value);
  <form onSubmit={() => onRename(note)}>
    <DialogHeader>{title}</DialogHeader>
    <Textarea value={note} onChange={handleNote} />
  </form>
};

// No Octane port of @example/react-toast: `Toaster` renders in a React island, and
// `toast()` calls run as they are.
export function Shell({ children }: { children: OctaneNode }) @{
  <main onCopy={() => toast.success("Copied")}>
    {children}
    <ReactCompat><Toaster position="top-right" toastOptions={{ style: { background: "var(--popover)" } }} /></ReactCompat>
  </main>
}

export function Button({ asChild, ...props }: ComponentProps<"button"> & { asChild?: boolean }) @{
  const Comp = asChild ? Slot : "button";
  <Comp data-slot="button" {...props} />
}

export const DialogOverlay = ({ className, ref, ...props }: ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay> & { ref?: Ref<ElementRef<typeof DialogPrimitive.Overlay>> }) => @{ <DialogPrimitive.Overlay ref={ref} className={className} {...props} /> };
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

export function CommandDialog({ children, ...props }: DialogProps) @{
  <DialogPrimitive.Root {...props}>
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content data-slot="dialog-content">
        <DialogPrimitive.Title className="sr-only">Command Palette</DialogPrimitive.Title>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>
}
