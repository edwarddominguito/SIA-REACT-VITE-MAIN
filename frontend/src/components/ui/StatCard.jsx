import cn from "@/lib/cn.js";
import Card from "@/components/ui/Card.jsx";

export default function StatCard({
  label = "",
  value = "",
  hint = "",
  icon = "",
  className = ""
}) {
  return (
    <Card className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="typo-caption uppercase tracking-[0.1em] text-zinc-500">{label}</span>
        {icon ? <i className={cn("bi text-zinc-500", icon)} aria-hidden="true"></i> : null}
      </div>
      <div className="text-3xl font-semibold tracking-tight text-zinc-950">{value}</div>
      {hint ? <p className="typo-caption text-zinc-600">{hint}</p> : null}
    </Card>
  );
}
