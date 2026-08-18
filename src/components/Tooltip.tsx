"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { useRef, useState } from "react";

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({
  content,
  children,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
}) {
  // Controlled open state, toggled on click/tap. Radix's built-in hover
  // handling explicitly ignores touch pointers (no hover-equivalent on
  // mobile), and its default click handler always *closes* the tooltip --
  // which stomps on a tap that just opened it via focus. Taking over
  // open/close here makes tap-to-toggle work on touch while leaving desktop
  // hover untouched. Outside-tap-to-dismiss still works for free via
  // Radix's DismissableLayer on the content.
  //
  // A tap also fires a `focus` event before `click`, and Radix's own
  // onFocus handler auto-opens the tooltip (skipped only if its internal
  // onPointerDown handler already ran) -- so a naive preventDefault on our
  // onPointerDown blocks *that* bookkeeping too, leaving Radix's onFocus
  // free to auto-open right before our onClick toggle flips it straight
  // back closed on the very first tap. Tracking the pointerdown ourselves
  // (without preventing it) and only suppressing focus-driven auto-open
  // when it followed a pointer tap keeps keyboard-focus opening (a11y)
  // intact while fixing tap-to-toggle.
  const [open, setOpen] = useState(false);
  const pointerDownRef = useRef(false);

  return (
    <TooltipPrimitive.Root delayDuration={200} open={open} onOpenChange={setOpen}>
      <TooltipPrimitive.Trigger
        asChild
        onPointerDown={() => {
          pointerDownRef.current = true;
        }}
        onFocus={(e) => {
          if (pointerDownRef.current) e.preventDefault();
        }}
        onClick={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
          pointerDownRef.current = false;
        }}
      >
        {children}
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          sideOffset={8}
          collisionPadding={12}
          className="z-50 max-w-xs rounded-lg border border-border bg-foreground px-3 py-2 text-label font-body text-background shadow-lg data-[state=delayed-open]:animate-[tooltip-in_0.15s_ease-out]"
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-foreground" width={10} height={5} />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
