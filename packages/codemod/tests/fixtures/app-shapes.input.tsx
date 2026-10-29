import { Tooltip } from "@base-ui/react/tooltip";
import { forwardRef, useState } from "react";
import { Toaster, toast } from "@example/react-toast";

// Shapes from migrating Memos and T3 Code: shadcn-style fields whose rest
// props carry React's per-edit `onChange`, `forwardRef` type arguments,
// annotations that name the global `React` namespace without importing it,
// a component that hands its `children` to a `render` prop, and a library
// with no Octane port.

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

// No Octane port of @example/react-toast: `Toaster` renders in a React island, and
// `toast()` calls run as they are.
export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main onCopy={() => toast.success("Copied")}>
      {children}
      <Toaster position="top-right" toastOptions={{ style: { background: "var(--popover)" } }} />
    </main>
  );
}
