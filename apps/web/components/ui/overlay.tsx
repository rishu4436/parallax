"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface OverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  kicker?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function Modal({ open, onOpenChange, title, kicker, description, children, className }: OverlayProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-modal bg-bg/88 duration-overlay" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-modal w-full max-w-xl -translate-x-1/2 -translate-y-1/2 border border-line bg-bg p-8 md:p-10",
            className,
          )}
        >
          {kicker ? <p className="kicker">{kicker}</p> : null}
          <Dialog.Title className="display mt-3 text-4xl md:text-5xl">{title}</Dialog.Title>
          {description ? <Dialog.Description className="mt-2 text-sm text-dim">{description}</Dialog.Description> : null}
          <div className="mt-6">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Drawer({ open, onOpenChange, title, kicker, description, children, className }: OverlayProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-drawer bg-black/50 duration-overlay" />
        <Dialog.Content
          className={cn(
            "fixed inset-y-0 right-0 z-drawer w-full max-w-md overflow-auto border-l border-line bg-bg p-8 duration-overlay",
            className,
          )}
        >
          {kicker ? <p className="kicker">{kicker}</p> : null}
          <Dialog.Title className="display text-4xl">{title}</Dialog.Title>
          {description ? <Dialog.Description className="mt-1 text-sm text-dim">{description}</Dialog.Description> : null}
          <div className="mt-6">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
