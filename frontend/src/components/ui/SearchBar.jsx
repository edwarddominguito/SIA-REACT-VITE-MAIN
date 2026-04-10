import cn from "@/lib/cn.js";

export default function SearchBar({
  className = "",
  inputClassName = "",
  iconClassName = "bi bi-search",
  action = null,
  ...inputProps
}) {
  return (
    <div
      className={cn(
        "flex h-14 w-full items-center gap-3 rounded-2xl border border-zinc-300 bg-white px-5",
        "mono-focus focus-within:border-zinc-900 focus-within:ring-2 focus-within:ring-zinc-900/15",
        className
      )}
    >
      <i className={cn("text-zinc-500", iconClassName)} aria-hidden="true"></i>
      <input
        {...inputProps}
        className={cn(
          "h-full flex-1 border-0 bg-transparent p-0 text-sm text-zinc-900 placeholder:text-zinc-500 focus:outline-none md:text-base",
          inputClassName
        )}
      />
      {action}
    </div>
  );
}
