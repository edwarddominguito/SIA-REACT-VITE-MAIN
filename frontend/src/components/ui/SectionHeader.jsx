import cn from "@/lib/cn.js";

export default function SectionHeader({
  kicker = "",
  title = "",
  description = "",
  centered = false,
  className = ""
}) {
  return (
    <header className={cn("ui-section-header", centered ? "mx-auto max-w-2xl text-center" : "", className)}>
      {kicker ? <span className="ui-kicker">{kicker}</span> : null}
      {title ? <h2 className="typo-section-title text-zinc-900">{title}</h2> : null}
      {description ? <p className="typo-body">{description}</p> : null}
    </header>
  );
}
