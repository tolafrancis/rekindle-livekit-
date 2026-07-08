import React from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import {
  BookOpen, Calendar, Star, Bookmark, BookmarkCheck,
  CheckCircle, Clock, ChevronRight, TrendingUp, Link
} from 'lucide-react';
import { getCategoryColor } from '@/lib/categoryDisplay';

interface DevotionalCardProps {
  series: {
    id: string;
    title: string;
    subtitle?: string;
    description: string;
    author?: string;
    author_social_url?: string;
    cover_image_url?: string;
    total_days: number;
    difficulty_level?: 'beginner' | 'intermediate' | 'advanced';
    is_featured: boolean;
    category_name?: string;
  };
  progress?: {
    completed_days: number;
    total_days: number;
    is_completed: boolean;
  };
  isBookmarked?: boolean;
  onSelect: () => void;
  onToggleBookmark?: () => void;
  compact?: boolean;
}

export const DevotionalCard: React.FC<DevotionalCardProps> = ({
  series,
  progress,
  isBookmarked = false,
  onSelect,
  onToggleBookmark,
  compact = false
}) => {
  const progressPercentage = progress
    ? Math.round((progress.completed_days / progress.total_days) * 100)
    : 0;

  const getDifficultyColor = (level?: string) => {
    switch (level) {
      case 'beginner': return 'bg-green-100 text-green-700 border-green-300';
      case 'intermediate': return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      case 'advanced': return 'bg-red-100 text-red-700 border-red-300';
      default: return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  if (compact) {
    return (
      <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={onSelect}>
        <CardContent className="p-4">
          <div className="flex gap-4">
            {series.cover_image_url && (
              <img src={series.cover_image_url} alt={series.title} className="w-20 h-20 object-cover rounded-lg" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {series.category_name && (
                      <Badge variant="outline" className="text-xs flex items-center gap-1.5">
                        <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: getCategoryColor(series.category_name) }} />
                        {series.category_name}
                      </Badge>
                    )}
                    {series.is_featured && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
                  </div>
                  <h3 className="font-semibold text-sm line-clamp-1">{series.title}</h3>
                  {series.author && (
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <span>{series.author}</span>
                      {series.author_social_url && (
                        <a 
                          href={series.author_social_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center hover:text-purple-600 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Link className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  )}
                </div>
                {onToggleBookmark && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); onToggleBookmark(); }}>
                    {isBookmarked ? <BookmarkCheck className="h-4 w-4 text-purple-600" /> : <Bookmark className="h-4 w-4" />}
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-600">
                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{series.total_days} days</span>
                {series.difficulty_level && <Badge className={`${getDifficultyColor(series.difficulty_level)} text-xs`}>{series.difficulty_level}</Badge>}
              </div>
              {progress && progress.completed_days > 0 && (
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                    <span>{progressPercentage}% complete</span>
                    {progress.is_completed && <CheckCircle className="h-3 w-3 text-green-600" />}
                  </div>
                  <Progress value={progressPercentage} className="h-1" />
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden hover:shadow-xl transition-all duration-300 group">
      <div className="relative">
        {series.cover_image_url ? (
          <div className="relative h-48 overflow-hidden">
            <img src={series.cover_image_url} alt={series.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          </div>
        ) : (
          <div className="h-48 bg-gradient-to-br from-purple-500 to-pink-500 relative">
            <div className="absolute inset-0 flex items-center justify-center"><BookOpen className="h-16 w-16 text-white/30" /></div>
          </div>
        )}
        <div className="absolute top-3 left-3 flex gap-2">
          {series.is_featured && <Badge className="bg-amber-500 text-white shadow-lg"><Star className="h-3 w-3 mr-1 fill-white" />Featured</Badge>}
          {progress?.is_completed && <Badge className="bg-green-600 text-white shadow-lg"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>}
        </div>
        {onToggleBookmark && (
          <button onClick={(e) => { e.stopPropagation(); onToggleBookmark(); }} className="absolute top-3 right-3 p-2 rounded-full bg-white/90 hover:bg-white shadow-lg transition-colors">
            {isBookmarked ? <BookmarkCheck className="h-4 w-4 text-purple-600" /> : <Bookmark className="h-4 w-4 text-gray-700" />}
          </button>
        )}
      </div>
      <CardContent className="p-5">
        {series.category_name && (
          <Badge variant="outline" className="mb-3 flex w-fit items-center gap-1.5">
            <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: getCategoryColor(series.category_name) }} />
            {series.category_name}
          </Badge>
        )}
        <h3 className="font-serif font-bold text-xl mb-2 line-clamp-2 min-h-[3.5rem]">{series.title}</h3>
        {series.subtitle && <p className="text-sm text-gray-600 mb-3 line-clamp-1">{series.subtitle}</p>}
        <p className="text-sm text-gray-700 mb-4 line-clamp-2">{series.description}</p>
        <div className="flex items-center gap-3 mb-4 text-xs flex-wrap">
          <span className="flex items-center gap-1 text-gray-600"><Calendar className="h-3 w-3" />{series.total_days} Days</span>
          <span className="flex items-center gap-1 text-gray-600"><Clock className="h-3 w-3" />~{series.total_days * 5} min</span>
          {series.difficulty_level && <Badge className={`${getDifficultyColor(series.difficulty_level)} text-xs border`}>{series.difficulty_level}</Badge>}
          {series.author && (
            <div className="flex items-center gap-1 text-gray-600">
              <span>by {series.author}</span>
              {series.author_social_url && (
                <a 
                  href={series.author_social_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center hover:text-purple-600 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Link className="h-3 w-3" />
                </a>
              )}
            </div>
          )}
        </div>
        {progress && progress.completed_days > 0 && (
          <div className="mb-4 p-3 bg-purple-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-purple-900">Progress</span>
              <span className="text-xs font-bold text-purple-600">{progressPercentage}%</span>
            </div>
            <Progress value={progressPercentage} className="mb-1" />
            <p className="text-xs text-purple-700">{progress.completed_days} of {progress.total_days} days</p>
          </div>
        )}
        <Button onClick={onSelect} className="w-full bg-purple-600 hover:bg-purple-700 group-hover:bg-purple-700 transition-colors">
          {progress && progress.completed_days > 0 ? <><TrendingUp className="h-4 w-4 mr-2" />Continue</> : <><BookOpen className="h-4 w-4 mr-2" />Start Reading</>}
          <ChevronRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
        </Button>
      </CardContent>
    </Card>
  );
};