import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4.5 [&_svg]:shrink-0 select-none",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--admin-primary,#C59B27)] text-white shadow-xs hover:brightness-110 active:scale-95",
        destructive:
          "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90 active:scale-95",
        outline:
          "border border-input bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground hover:border-[var(--admin-primary,#C59B27)]/60 active:scale-95",
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80 active:scale-95",
        ghost: "hover:bg-accent hover:text-accent-foreground active:scale-95",
        link: "text-[var(--admin-primary,#C59B27)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 rounded-lg px-5 py-2.5 text-sm font-semibold",
        sm: "h-8.5 rounded-lg px-3.5 text-xs font-semibold",
        md: "h-10 rounded-lg px-5 py-2.5 text-sm font-semibold",
        lg: "h-11 rounded-xl px-6 py-3 text-base font-semibold",
        xl: "h-12 rounded-xl px-7 py-3.5 text-base font-bold",
        icon: "h-10 w-10 rounded-lg p-0",
        "icon-sm": "h-8.5 w-8.5 rounded-lg p-0",
        xs: "h-7.5 rounded-md px-2.5 text-xs font-medium",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props} />
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }
