"use client";

import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const button = cva("btn", {
  variants: {
    tone: {
      primary: "btn-primary",
      secondary: "btn-secondary",
      ghost: "btn-ghost",
      danger: "btn-danger",
      buy: "btn-secondary btn-buy",
      sell: "btn-secondary btn-sell",
    },
    size: {
      sm: "btn-sm",
      md: "",
      lg: "btn-lg",
    },
  },
  defaultVariants: {
    tone: "secondary",
    size: "md",
  },
});

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {}

export function Button({ className, tone, size, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(button({ tone, size }), className)} {...props} />;
}
