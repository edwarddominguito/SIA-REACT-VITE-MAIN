import cn from "@/lib/cn.js";

export default function FilterGroup({ label = "", className = "", children }) {
  return (
    <section className={cn("space-y-3", className)}>
      {label ? <h3 className="text-sm font-semibold tracking-tight text-zinc-900">{label}</h3> : null}
      <div className="space-y-2">{children}</div>
    </section>
  );
}
