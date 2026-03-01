interface StatCardProps {
  icon: string;
  label: string;
  value: string | number;
  sub?: string;
  color?: 'teal' | 'coral' | 'blue' | 'purple';
}

const colorMap = {
  teal:   { bg: 'bg-primary-light', icon: 'bg-primary text-white' },
  coral:  { bg: 'bg-orange-50',     icon: 'bg-coral text-white' },
  blue:   { bg: 'bg-blue-50',       icon: 'bg-blue-500 text-white' },
  purple: { bg: 'bg-purple-50',     icon: 'bg-purple-500 text-white' },
};

export default function StatCard({ icon, label, value, sub, color = 'teal' }: StatCardProps) {
  const c = colorMap[color];
  return (
    <div className={`card p-5 flex items-center gap-4 ${c.bg}`}>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${c.icon} flex-shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
        <p className="text-sm font-medium text-gray-600">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}
