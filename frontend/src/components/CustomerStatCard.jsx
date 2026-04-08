export default function CustomerStatCard({ label, value, icon }) {
  return (
    <article className="agent-stat-card">
      <div className="agent-stat-top">
        <span>{label}</span>
        <i className={`bi ${icon}`}></i>
      </div>
      <strong>{value}</strong>
    </article>
  );
}
