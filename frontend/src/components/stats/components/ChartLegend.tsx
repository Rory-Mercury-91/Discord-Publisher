interface ChartLegendProps {
  payload?: Array<{ value: string; color: string }>;
}

export default function ChartLegend({ payload }: ChartLegendProps) {
  if (!payload?.length) return null;
  return (
    <div className="stats-view-legend">
      {payload.map((e, i) => (
        <span key={i} className="stats-view-legend__item">
          <span className="stats-view-legend__dot" style={{ background: e.color }} />
          {e.value}
        </span>
      ))}
    </div>
  );
}
