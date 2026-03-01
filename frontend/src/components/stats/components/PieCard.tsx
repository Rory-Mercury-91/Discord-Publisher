import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import ChartLegend from './ChartLegend';

interface PieCardProps {
  title: string;
  data: { name: string; value: number }[];
  colorFn: (i: number) => string;
}

const tooltipStyles = {
  contentStyle: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 12 },
  itemStyle: { color: 'var(--text)' },
  labelStyle: { color: 'var(--muted)', fontWeight: 600 },
};

export default function PieCard({ title, data, colorFn }: PieCardProps) {
  return (
    <div className="stats-view-pie-card">
      <div className="stats-view-pie-card__title">{title}</div>
      <ResponsiveContainer width="100%" height={190}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={68}>
            {data.map((_, i) => (
              <Cell key={i} fill={colorFn(i)} />
            ))}
          </Pie>
          <Tooltip {...tooltipStyles} />
          <Legend content={ChartLegend} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
