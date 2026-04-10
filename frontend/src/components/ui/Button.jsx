import cn from "@/lib/cn.js";

const VARIANT_CLASSES = Object.freeze({
  primary: "border border-black bg-black text-white hover:bg-zinc-900",
  secondary: "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50",
  ghost: "border border-transparent bg-transparent text-zinc-900 hover:bg-zinc-100"
});

const SIZE_CLASSES = Object.freeze({
  default: "h-11 px-5 rounded-xl text-sm font-semibold",
  cta: "h-12 px-6 rounded-xl text-sm font-semibold md:text-base"
});

export default function Button({
  as: Component = "button",
  variant = "primary",
  size = "default",
  loading = false,
  disabled = false,
  className = "",
  children,
  ...props
}) {
  const isButton = Component === "button";
  const isDisabled = Boolean(disabled || loading);

  const classes = cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap no-underline transition-colors duration-150 mono-focus",
    VARIANT_CLASSES[variant] || VARIANT_CLASSES.primary,
    SIZE_CLASSES[size] || SIZE_CLASSES.default,
    isDisabled ? "cursor-not-allowed opacity-60" : "",
    className
  );

  const nextProps = {
    ...props,
    className: classes
  };

  if (isButton) {
    nextProps.type = props.type || "button";
    nextProps.disabled = isDisabled;
  } else if (isDisabled) {
    nextProps["aria-disabled"] = "true";
  }

  return (
    <Component {...nextProps}>
      {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true"></span> : null}
      <span>{children}</span>
    </Component>
  );
}
