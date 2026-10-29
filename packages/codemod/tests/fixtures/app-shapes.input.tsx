import { Tooltip } from "@base-ui/react/tooltip";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { type DialogProps } from "@radix-ui/react-dialog";
import { Slot } from "@radix-ui/react-slot";
import { forwardRef, useState } from "react";

// Shapes from migrating Memos and T3 Code: shadcn-style fields whose rest
// props carry React's per-edit `onChange`, `forwardRef` type arguments,
// annotations that name the global `React` namespace without importing it,
// a component that hands its `children` to a `render` prop, and shadcn's
// Radix components.

export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return <input type={type} data-slot="input" className={className} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={className}
      {...props}
    />
  );
}

export const DialogHeader = forwardRef<React.ElementRef<"div">, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => <div ref={ref} className={className} {...props} />,
);

// Base UI clones the element `render` gets, which React passes as `children`.
const TimeTooltip = ({ children, label }: { children: React.ReactElement; label: string }) => (
  <Tooltip.Root>
    <Tooltip.Trigger render={children} />
    <Tooltip.Popup>{label}</Tooltip.Popup>
  </Tooltip.Root>
);

export function MemoTime({ when, linked }: { when: string; linked: boolean }) {
  return (
    <TimeTooltip label={when}>
      {linked ? <a href="#memo">{when}</a> : <span>{when}</span>}
    </TimeTooltip>
  );
}

export const RenameDialog: React.FC<{ title: React.ReactNode; onRename(name: string): void }> = ({
  title,
  onRename,
}) => {
  const [note, setNote] = useState("");
  const handleNote = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setNote(e.target.value);
  return (
    <form onSubmit={() => onRename(note)}>
      <DialogHeader>{title}</DialogHeader>
      <Textarea value={note} onChange={handleNote} />
    </form>
  );
};

export function Button({ asChild, ...props }: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp data-slot="button" {...props} />;
}

export const DialogOverlay = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => <DialogPrimitive.Overlay ref={ref} className={className} {...props} />);
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

export function CommandDialog({ children, ...props }: DialogProps) {
  return (
    <DialogPrimitive.Root {...props}>
      <DialogPrimitive.Portal>
        <DialogOverlay />
        <DialogPrimitive.Content data-slot="dialog-content">
          <DialogPrimitive.DialogTitle className="sr-only">Command Palette</DialogPrimitive.DialogTitle>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
