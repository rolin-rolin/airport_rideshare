"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import { SignInPanel } from "@/components/SignInPanel";

type PromptOptions = { title?: string; message?: string; next?: string };
type OpenPrompt = (options?: PromptOptions) => void;

const SignInPromptContext = createContext<OpenPrompt | null>(null);

// Returns a function that opens the sign-in modal, or null when the viewer
// is signed in. The dashboard layout only mounts the provider for
// signed-out visitors, so components (TripCard, the header buttons) use
// "is there a prompt?" as their signed-out check without threading an auth
// flag through every prop list.
export function useSignInPrompt(): OpenPrompt | null {
  return useContext(SignInPromptContext);
}

export function SignInPromptProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<PromptOptions | null>(null);
  const open = useCallback<OpenPrompt>((opts) => setOptions(opts ?? {}), []);
  const close = useCallback(() => setOptions(null), []);

  useEffect(() => {
    if (!options) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [options, close]);

  return (
    <SignInPromptContext.Provider value={open}>
      {children}
      {options && (
        <Modal>
          <div role="dialog" aria-modal="true" aria-label="Sign in" className="relative">
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="absolute -right-1 -top-1 rounded-full px-2 text-display-lg leading-none text-foreground/40 transition-colors hover:text-foreground"
            >
              &times;
            </button>
            <SignInPanel title={options.title} message={options.message} next={options.next} />
          </div>
        </Modal>
      )}
    </SignInPromptContext.Provider>
  );
}

// A button that opens the sign-in prompt. Used for header actions on the
// signed-out board ("Post a trip", "Sign in").
export function SignInPromptButton({
  children,
  className,
  title,
  message,
  next,
}: {
  children: React.ReactNode;
  className?: string;
} & PromptOptions) {
  const openPrompt = useSignInPrompt();
  return (
    <button
      type="button"
      className={className}
      onClick={() => openPrompt?.({ title, message, next })}
    >
      {children}
    </button>
  );
}
