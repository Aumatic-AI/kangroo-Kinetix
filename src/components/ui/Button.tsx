import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-white hover:bg-primary-hover",
        secondary: "bg-secondary text-text hover:bg-secondary-hover",
        outline: "bg-white border border-primary text-primary hover:bg-primary-subtle",
        ghost: "bg-transparent text-text hover:bg-surface",
        destructive: "bg-danger text-white hover:opacity-90",
        white: "bg-white text-text shadow-md hover:bg-surface",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        default: "px-4 py-[13px] h-[46px]",
        lg: "h-12 px-5 text-base",
        icon: "h-[46px] w-[46px]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  icon?: React.ReactNode
  loading?: boolean
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  icon,
  loading,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={loading || props.disabled}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading ? (
            <svg
              className={cn("animate-spin h-4 w-4 text-current", children && "-ml-1 mr-2")}
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          ) : icon ? (
            icon
          ) : null}
          {loading && !children ? null : children}
        </>
      )}
    </Comp>
  )
}

export { buttonVariants }