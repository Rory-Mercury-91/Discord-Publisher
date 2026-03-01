interface KpiCardProps {
  icon: string;
  label: string;
  value: number;
  color: string;
  sub?: string;
}

export default function KpiCard({ icon, label, value, color, sub }: KpiCardProps) {
  return (
    <div
      className="stats-view-kpi"
      style={{ borderColor: `${color}44` }}
    >
      <div className="stats-view-kpi__icon">{icon}</div>
      <div className="stats-view-kpi__value" style={{ color }}>
        {value}
      </div>
      <div className="stats-view-kpi__label">{label}</div>
      {sub && (
        <div className="stats-view-kpi__sub" style={{ color }}>
          {sub}
        </div>
      )}
    </div>
  );
}
