import React, { useState } from 'react';
import { PrayerTopic, prayerPoints } from '../data/prayers';
import { ChevronDown, ChevronUp, BookOpen } from 'lucide-react';

interface Props {
  topic: PrayerTopic;
  onClick: () => void;
}

export const PrayerTopicCard: React.FC<Props> = ({ topic, onClick }) => {
  const [showScriptures, setShowScriptures] = useState(false);
  
  // Get prayer points for this topic
  const topicPrayerPoints = prayerPoints.filter(p => p.topicId === topic.id).slice(0, 3);

  const handleToggleScriptures = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowScriptures(!showScriptures);
  };

  return (
    <div className="rounded-xl overflow-hidden bg-white shadow-lg hover:shadow-xl transition-all">
      <div 
        onClick={onClick}
        className="relative cursor-pointer group h-48"
      >
        <img 
          src={topic.imageUrl} 
          alt={topic.name}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex flex-col justify-end p-5">
          <h3 className="text-white font-bold text-xl mb-1">{topic.name}</h3>
          <p className="text-white/90 text-sm">{topic.count} prayer points</p>
        </div>
      </div>
      
      {/* Scripture Preview Section */}
      <div className="p-4 border-t">
        <button
          onClick={handleToggleScriptures}
          className="w-full flex items-center justify-between text-sm text-purple-600 hover:text-purple-700 font-medium"
        >
          <span className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            View Scriptures
          </span>
          {showScriptures ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        
        {showScriptures && (
          <div className="mt-4 space-y-4">
            {topicPrayerPoints.map((point) => (
              <div key={point.id} className="bg-purple-50 rounded-lg p-3">
                <p className="font-semibold text-purple-800 text-sm mb-1">{point.scripture}</p>
                {point.scriptureText && (
                  <p className="text-gray-700 text-sm italic leading-relaxed">
                    "{point.scriptureText}"
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-2">{point.title}</p>
              </div>
            ))}
            {topicPrayerPoints.length === 0 && (
              <p className="text-gray-500 text-sm text-center py-2">
                No scriptures available for this topic yet.
              </p>
            )}
            <button
              onClick={onClick}
              className="w-full text-center text-sm text-purple-600 hover:text-purple-700 font-medium pt-2"
            >
              View all {topic.count} prayer points →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
