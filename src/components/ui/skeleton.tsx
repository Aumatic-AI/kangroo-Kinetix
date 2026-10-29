import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-secondary", className)}
      style={{ animationDuration: '1.5s' }}
      {...props}
    />
  )
}

export { Skeleton }
