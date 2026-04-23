/**
 * MobileSelect — drop-in replacement for shadcn Select.
 * On mobile (touch-primary) devices renders a bottom Sheet picker.
 * On desktop it falls back to the standard shadcn Select.
 *
 * Props mirror a minimal Select API:
 *   value, onValueChange, placeholder, options: [{value, label}]
 *   className — forwarded to the trigger
 */
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Check } from "lucide-react";

function useIsMobile() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

export default function MobileSelect({ value, onValueChange, placeholder = "Select…", options = [], className = "", triggerClassName = "" }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  const current = options.find((o) => o.value === value);

  if (!isMobile) {
    return (
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className={triggerClassName || className}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring ${triggerClassName || className}`}
      >
        <span className={current ? "" : "text-muted-foreground"}>
          {current ? current.label : placeholder}
        </span>
        <svg className="h-4 w-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Bottom sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[60vh] overflow-y-auto pb-safe">
          <SheetHeader className="mb-2">
            <SheetTitle className="text-sm">{placeholder}</SheetTitle>
          </SheetHeader>
          <div className="space-y-1">
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => { onValueChange(o.value); setOpen(false); }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm transition-colors ${
                  o.value === value ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
                }`}
              >
                {o.label}
                {o.value === value && <Check className="w-4 h-4" />}
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}