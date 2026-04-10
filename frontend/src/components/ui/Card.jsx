import cn from "@/lib/cn.js";

export default function Card({ as: Component = "article", className = "", children, ...props }) {
  return (
    <Component
      {...props}
      className={cn("rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm md:p-6", className)}
    >
      {children}
    </Component>
  );
}
