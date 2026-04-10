import { forwardRef } from "react";
import cn from "@/lib/cn.js";

const Input = forwardRef(function Input({ className = "", error = false, ...props }, ref) {
  return (
    <input
      ref={ref}
      {...props}
      className={cn(
        "h-12 w-full rounded-xl border bg-white px-4 text-sm text-zinc-900 placeholder:text-zinc-500",
        "mono-focus disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500",
        error ? "border-zinc-900" : "border-zinc-300",
        className
      )}
    />
  );
});

export default Input;
