import { forwardRef, useState } from "react";

// Shapes from migrating Memos and T3 Code: shadcn-style fields whose rest
// props carry React's per-edit `onChange`, `forwardRef` type arguments and
// annotations that name the global `React` namespace without importing it.

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
