export function AdminStatCard({ label, value, icon, helper, tone = "neutral", delta }) {
  return (
    <article className={`agent-stat-card agent-stat-card-${tone}`}>
      <div className="agent-stat-top">
        <span>{label}</span>
        <i className={`bi ${icon}`}></i>
      </div>
      <strong>{value}</strong>
      {(helper || delta) && (
        <div className="agent-stat-meta">
          {helper ? <span>{helper}</span> : <span></span>}
          {delta ? <em>{delta}</em> : null}
        </div>
      )}
    </article>
  );
}

export function AdminMiniBarChart({ data }) {
  const max = Math.max(...data.map((item) => Number(item.value || 0)), 1);
  return (
    <div className="admin-mini-chart" role="img" aria-label="Monthly activity chart">
      {data.map((item) => {
        const value = Number(item.value || 0);
        const pct = Math.max((value / max) * 100, 8);
        return (
          <div key={item.key} className="admin-mini-chart-col" title={`${item.label}: ${value}`}>
            <div className="admin-mini-chart-bar-wrap">
              <div className="admin-mini-chart-bar" style={{ height: `${pct}%` }}></div>
            </div>
            <span>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}
