import cn from "@/lib/cn.js";

export default function DataTable({
  columns = [],
  rows = [],
  keyField = "id",
  emptyLabel = "No rows available.",
  className = "",
  rowClassName = ""
}) {
  return (
    <div className={cn("overflow-x-auto rounded-2xl border border-zinc-200 bg-white", className)}>
      <table className="min-w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50">
            {columns.map((column) => (
              <th
                key={column.key}
                className={cn(
                  "h-12 px-4 text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500",
                  column.headerClassName || ""
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, index) => (
              <tr key={String(row[keyField] ?? index)} className={cn("h-14 border-b border-zinc-100 hover:bg-zinc-50", rowClassName)}>
                {columns.map((column) => (
                  <td key={`${column.key}-${String(row[keyField] ?? index)}`} className={cn("px-4 py-3 text-sm text-zinc-700", column.cellClassName || "")}>
                    {typeof column.render === "function" ? column.render(row, index) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td className="h-24 px-4 text-sm text-zinc-500" colSpan={columns.length || 1}>
                {emptyLabel}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
