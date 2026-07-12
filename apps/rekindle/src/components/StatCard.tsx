import React from 'react';

interface Props {
  label: string;
  value: string | number;
  icon: string;
  color: string;
}

export const StatCard: React.FC<Props> = ({ label, value, icon, color }) => {
  return (
    <div className={`${color} rounded-xl p-4 sm:p-5 text-white`}>
      <div className="flex items-center justify-between mb-2 gap-2">
        <span className="text-2xl sm:text-3xl shrink-0">{icon}</span>
        <span className="text-2xl sm:text-3xl font-bold truncate">{value}</span>
      </div>
      <p className="text-xs sm:text-sm opacity-90 truncate">{label}</p>
    </div>
  );
};
