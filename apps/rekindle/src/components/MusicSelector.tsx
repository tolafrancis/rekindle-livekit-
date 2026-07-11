import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Slider } from './ui/slider';
import { fetchMusicTracks, getTrackById, MusicTrack } from '@/lib/musicStorage';
import { 
  Search, 
  Music, 
  CheckCircle, 
  Play, 
  Pause, 
  Volume2, 
  VolumeX,
  Loader2,
  X
} from 'lucide-react';

interface MusicSelectorProps {
  selectedMusicId: string | null;
  onSelect: (musicId: string | null, musicUrl?: string) => void;
  showPreview?: boolean;
  compact?: boolean;
}

export const MusicSelector: React.FC<MusicSelectorProps> = ({ 
  selectedMusicId, 
  onSelect,
  showPreview = true,
  compact = false
}) => {
  const [musicList, setMusicList] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<MusicTrack | null>(null);
  
  // Preview state
  const [previewTrackId, setPreviewTrackId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(50);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    loadMusic();
  }, []);

  useEffect(() => {
    // Load selected track details
    if (selectedMusicId && musicList.length > 0) {
      const track = musicList.find(m => m.id === selectedMusicId);
      setSelectedTrack(track || null);
    } else {
      setSelectedTrack(null);
    }
  }, [selectedMusicId, musicList]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume / 100;
    }
  }, [volume, isMuted]);

  const loadMusic = async () => {
    setLoading(true);
    setError(null);
    
    const result = await fetchMusicTracks({ publishedOnly: false });
    
    if (result.success) {
      setMusicList(result.tracks);
    } else {
      setError(result.error || 'Failed to load music');
    }
    
    setLoading(false);
  };

  const handleSelect = (music: MusicTrack) => {
    if (selectedMusicId === music.id) {
      onSelect(null);
    } else {
      onSelect(music.id, music.file_url);
    }
  };

  const togglePreview = (music: MusicTrack, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (previewTrackId === music.id) {
      // Stop preview
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPreviewTrackId(null);
      setIsPlaying(false);
    } else {
      // Start new preview
      setPreviewTrackId(music.id);
      setIsPlaying(true);
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    setPreviewTrackId(null);
  };

  const filteredMusic = musicList.filter(music => 
    music.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    music.artist?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    music.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const previewTrack = previewTrackId ? musicList.find(m => m.id === previewTrackId) : null;

  if (compact) {
    return (
      <div className="space-y-2">
        {/* Hidden Audio Element */}
        {previewTrack && (
          <audio
            ref={audioRef}
            src={previewTrack.file_url}
            autoPlay
            onEnded={handleAudioEnded}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />
        )}

        {/* Selected Track Display */}
        {selectedTrack ? (
          <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg">
            <Music className="h-4 w-4 text-green-600" />
            <span className="text-sm font-medium text-green-700 flex-1 truncate">
              {selectedTrack.title}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-green-600 hover:text-green-700"
              onClick={() => onSelect(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No background music selected</p>
        )}

        {/* Quick Select Dropdown */}
        <select
          className="w-full p-2 border rounded-md text-sm"
          value={selectedMusicId || ''}
          onChange={(e) => {
            const music = musicList.find(m => m.id === e.target.value);
            if (music) {
              onSelect(music.id, music.file_url);
            } else {
              onSelect(null);
            }
          }}
        >
          <option value="">Select background music...</option>
          {musicList.map(music => (
            <option key={music.id} value={music.id}>
              {music.title} - {music.artist}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Hidden Audio Element */}
      {previewTrack && (
        <audio
          ref={audioRef}
          src={previewTrack.file_url}
          autoPlay
          onEnded={handleAudioEnded}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search music by title, artist or category..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Preview Controls */}
      {showPreview && previewTrack && (
        <div className="flex items-center gap-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-purple-600"
            onClick={() => {
              if (audioRef.current) {
                if (isPlaying) {
                  audioRef.current.pause();
                } else {
                  audioRef.current.play();
                }
              }
            }}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-purple-700 truncate">{previewTrack.title}</p>
            <p className="text-xs text-purple-500 truncate">{previewTrack.artist}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-purple-600"
              onClick={() => setIsMuted(!isMuted)}
            >
              {isMuted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
            </Button>
            <Slider
              value={[isMuted ? 0 : volume]}
              max={100}
              onValueChange={(v) => setVolume(v[0])}
              className="w-16"
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-purple-600"
            onClick={() => {
              setPreviewTrackId(null);
              setIsPlaying(false);
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      
      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}
      
      {/* Music List */}
      <div className="max-h-60 overflow-y-auto border rounded-md">
        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-gray-400 mb-2" />
            <p className="text-sm text-gray-500">Loading music...</p>
          </div>
        ) : filteredMusic.length === 0 ? (
          <div className="p-8 text-center">
            <Music className="h-10 w-10 mx-auto text-gray-300 mb-2" />
            <p className="text-gray-500 font-medium">No music found</p>
            <p className="text-sm text-gray-400 mt-1">
              {musicList.length === 0 
                ? 'Upload some music to the library first' 
                : 'Try adjusting your search'}
            </p>
          </div>
        ) : (
          filteredMusic.map(music => (
            <Card 
              key={music.id} 
              className={`mb-2 cursor-pointer transition-colors ${
                selectedMusicId === music.id 
                  ? 'border-2 border-green-500 bg-green-50' 
                  : 'hover:bg-gray-50'
              }`}
              onClick={() => handleSelect(music)}
            >
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center flex-1 min-w-0">
                  <div className={`w-10 h-10 rounded flex items-center justify-center mr-3 flex-shrink-0 ${
                    selectedMusicId === music.id 
                      ? 'bg-green-100' 
                      : 'bg-gray-100'
                  }`}>
                    {music.cover_image_url ? (
                      <img 
                        src={music.cover_image_url} 
                        alt="" 
                        className="w-full h-full object-cover rounded" 
                      />
                    ) : (
                      <Music className={`h-5 w-5 ${
                        selectedMusicId === music.id ? 'text-green-600' : 'text-gray-500'
                      }`} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{music.title}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {music.artist} {music.category && `• ${music.category}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-2">
                  {showPreview && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-8 w-8 ${
                        previewTrackId === music.id && isPlaying 
                          ? 'text-purple-600' 
                          : 'text-gray-400 hover:text-purple-600'
                      }`}
                      onClick={(e) => togglePreview(music, e)}
                      title="Preview"
                    >
                      {previewTrackId === music.id && isPlaying ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                  {selectedMusicId === music.id && (
                    <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
      
      {/* Selected Track Info */}
      {selectedMusicId && selectedTrack && (
        <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <span className="text-sm font-medium text-green-700">
              Selected: {selectedTrack.title}
            </span>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => onSelect(null)}
            className="text-green-600 hover:text-green-700"
          >
            Clear
          </Button>
        </div>
      )}
    </div>
  );
};

export default MusicSelector;
