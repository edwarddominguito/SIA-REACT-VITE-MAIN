import { Link } from "react-router-dom";
import cn from "@/lib/cn.js";

const splitPriceLabel = (priceLike) => {
  const raw = String(priceLike || "").trim();
  if (!raw) {
    return { currency: "", amount: "-", suffix: "" };
  }

  const match = raw.match(/^(PHP)\s+([0-9,]+)(\/.+)?$/i);
  if (match) {
    return {
      currency: String(match[1] || "").toUpperCase(),
      amount: match[2] || "-",
      suffix: match[3] || ""
    };
  }

  return { currency: "", amount: raw, suffix: "" };
};

export default function ListingCard({
  imageSrc = "",
  imageAlt = "Property",
  title = "Property Listing",
  location = "-",
  price = "-",
  badges = [],
  meta = [],
  statusLabel = "",
  actionTo = "",
  actionLabel = "View Details",
  onImageError = null,
  className = "",
  children = null
}) {
  const priceParts = splitPriceLabel(price);

  return (
    <article className={cn("flex h-full flex-col overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-sm", className)}>
      <div className="relative h-[196px] w-full overflow-hidden border-b border-zinc-200 bg-zinc-100 md:h-[224px]">
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={imageAlt}
            className="h-full w-full object-cover"
            onError={onImageError || undefined}
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-sm text-zinc-500">No image</div>
        )}
        {statusLabel ? (
          <span className="absolute left-4 top-4 ui-badge bg-black/85 text-white">{statusLabel}</span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-[10px] p-[14px] md:gap-3 md:p-4">
        <div className="min-h-[96px] space-y-2 md:min-h-[104px]">
          <h3 className="min-h-[50px] text-[0.95rem] font-semibold leading-[1.2] tracking-tight text-zinc-900 md:min-h-[56px] md:text-[1rem]">
            {title}
          </h3>
          <p className="typo-body flex items-center gap-2">
            <i className="bi bi-geo-alt text-zinc-500" aria-hidden="true"></i>
            <span>{location}</span>
          </p>
        </div>

        {!!badges.length && (
          <div className="flex flex-wrap gap-2">
            {badges.map((badge) => (
              <span key={badge} className="ui-badge border border-zinc-200 bg-zinc-50 text-zinc-700">
                {badge}
              </span>
            ))}
          </div>
        )}

        {!!meta.length && (
          <div className="grid gap-1">
            {meta.map((item) => (
              <span key={item} className="typo-caption text-zinc-600">
                {item}
              </span>
            ))}
          </div>
        )}

        {children}

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-zinc-200 pt-3">
          <div className="flex min-w-0 flex-col">
            {priceParts.currency ? (
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                {priceParts.currency}
              </span>
            ) : null}
            <strong className="text-[1.42rem] font-semibold leading-none tracking-tight text-zinc-950 md:text-[1.56rem]">
              {priceParts.amount}
              {priceParts.suffix ? (
                <span className="ml-1 text-[0.92rem] font-medium tracking-[-0.01em] text-zinc-600">
                  {priceParts.suffix}
                </span>
              ) : null}
            </strong>
          </div>
          {actionTo ? (
            <Link
              to={actionTo}
              className="inline-flex h-9 min-w-[94px] items-center justify-center rounded-xl border border-zinc-300 px-4 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-50 mono-focus"
            >
              {actionLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}
