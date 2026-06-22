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
    <div className={`card p-4 md:p-5 flex items-center gap-3 md:gap-4 ${c.bg}`}>
      <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center text-lg md:text-xl ${c.icon} flex-shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xl md:text-2xl font-bold text-gray-900 leading-tight truncate">{value}</p>
        <p className="text-xs md:text-sm font-medium text-gray-600 truncate">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}
