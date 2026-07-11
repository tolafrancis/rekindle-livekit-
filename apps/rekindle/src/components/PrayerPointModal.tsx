import React from 'react';
import { PrayerPoint } from '../data/prayers';

interface Props {
  prayerPoint: PrayerPoint | null;
  onClose: () => void;
  onPray: () => void;
}

export const PrayerPointModal: React.FC<Props> = ({ prayerPoint, onClose, onPray }) => {
  if (!prayerPoint) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full p-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-2xl font-serif font-bold text-gray-900">{prayerPoint.title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
        </div>
        
        <div className="mb-4">
          <span className={`text-xs px-3 py-1 rounded-full ${
            prayerPoint.intensity === 'deep' ? 'bg-purple-100 text-purple-800' :
            prayerPoint.intensity === 'medium' ? 'bg-blue-100 text-blue-800' :
            'bg-green-100 text-green-800'
          }`}>
            {prayerPoint.intensity} intensity
          </span>
        </div>

        <p className="text-gray-700 mb-6 leading-relaxed">{prayerPoint.body}</p>

        <div className="bg-purple-50 rounded-lg p-4 mb-6">
          <p className="text-sm text-purple-900 font-semibold mb-1">Scripture Reference</p>
          <p className="text-purple-800 italic">{prayerPoint.scripture}</p>
        </div>

        <button 
          onClick={onPray}
          className="w-full bg-gradient-to-r from-purple-600 to-purple-800 text-white py-3 rounded-lg font-bold hover:from-purple-700 hover:to-purple-900 transition-all"
        >
          I Prayed This
        </button>
      </div>
    </div>
  );
};
