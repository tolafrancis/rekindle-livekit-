import React from 'react';
import { Badge } from '../data/badges';
import { Badge as UIBadge } from './ui/badge';

interface Props {
  badge: Badge;
}

const getTierColors = (tier: string, earned: boolean) => {
  if (!earned) return 'from-gray-200 to-gray-300';
  
  const colors = {
    bronze: 'from-amber-600 via-amber-500 to-amber-700',
    silver: 'from-gray-400 via-gray-300 to-gray-500',
    gold: 'from-yellow-400 via-yellow-300 to-yellow-600',
    platinum: 'from-cyan-400 via-blue-300 to-cyan-600',
    diamond: 'from-purple-400 via-pink-300 to-purple-600'
  };
  
  return colors[tier as keyof typeof colors] || colors.bronze;
};

const getRarityBorder = (rarity: string) => {
  const borders = {
    common: 'border-gray-400',
    uncommon: 'border-green-500',
    rare: 'border-blue-500',
    epic: 'border-purple-500',
    legendary: 'border-yellow-500'
  };
  
  return borders[rarity as keyof typeof borders] || borders.common;
};

export const BadgeCard: React.FC<Props> = ({ badge }) => {
  const progressPercent = badge.target ? ((badge.progress || 0) / badge.target) * 100 : 0;
  const tierColors = getTierColors(badge.tier, badge.earned);
  const rarityBorder = getRarityBorder(badge.rarity);
  
  return (
    <div className={`
      rounded-xl p-4 border-2 transition-all duration-300 hover:scale-105 hover:shadow-lg
      ${badge.earned ? `bg-gradient-to-br ${tierColors}` : 'bg-gray-100'}
      ${badge.earned ? rarityBorder : 'border-gray-300'}
    `}>
      <div className="text-center relative">
        {/* Rarity indicator */}
        {badge.earned && (
          <div className="absolute -top-2 -right-2">
            <UIBadge variant="secondary" className="text-[10px] px-1.5 py-0.5">
              {badge.rarity}
            </UIBadge>
          </div>
        )}
        
        <div className={`text-4xl mb-2 ${!badge.earned && 'grayscale opacity-50'}`}>
          {badge.icon}
        </div>
        
        <h4 className={`font-bold text-sm mb-1 ${badge.earned ? 'text-white' : 'text-gray-700'}`}>
          {badge.name}
        </h4>
        
        <p className={`text-xs mb-2 ${badge.earned ? 'text-white/90' : 'text-gray-600'}`}>
          {badge.description}
        </p>
        
        {/* Points badge */}
        <div className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
          badge.earned ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'
        }`}>
          <span>⭐</span>
          <span className="font-semibold">{badge.points} pts</span>
        </div>
        
        {/* Progress bar */}
        {!badge.earned && badge.target && (
          <div className="mt-3">
            <div className="w-full bg-gray-300 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-purple-600 to-purple-400 h-2 rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="text-xs text-gray-600 mt-1 font-medium">
              {badge.progress}/{badge.target}
            </p>
          </div>
        )}
        
        {/* Earned date */}
        {badge.earned && badge.unlockDate && (
          <p className="text-xs text-white/70 mt-2">
            Earned {new Date(badge.unlockDate).toLocaleDateString()}
          </p>
        )}
      </div>
    </div>
  );
};
