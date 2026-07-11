import { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { 
  uploadAndSaveTrack, 
  fetchMusicTracks, 
  validateAudioFile,
  MusicTrack 
} from '@/lib/musicStorage';
import { 
  Music, 
  Play, 
  Pause, 
  Upload, 
  Search, 
  Heart, 
  Volume2, 
  VolumeX, 
  SkipBack, 
  SkipForward,
  Loader2,
  CheckCircle,
  AlertCircle
} from 'lucide-react';

interface Props {
  onSelectTrack?: (track: MusicTrack) => void;
  currentTrack?: MusicTrack | null;
  isPlaying?: boolean;
  selectionMode?: boolean; // When true, shows selection UI for picking background music
  selectedTrackId?: string | null;
  onTrackSelected?: (track: MusicTrack | null) => void; // Callback when a track is selected as background music
}

export function MusicLibrary({ 
  onSelectTrack, 
  currentTrack, 
  isPlaying: externalIsPlaying,
  selectionMode = false,
  selectedTrackId,
  onTrackSelected
}: Props) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<string[]>([]);
  
  // Audio player state
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [activeTrack, setActiveTrack] = useState<MusicTrack | null>(null);
  const [previewTrack, setPreviewTrack] = useState<MusicTrack | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadTracks();
    loadFavorites();
  }, [user]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume / 100;
    }
  }, [volume, isMuted]);

  useEffect(() => {
    // Sync with external playing state
    if (externalIsPlaying !== undefined && activeTrack) {
      setPlaying(externalIsPlaying);
    }
  }, [externalIsPlaying, activeTrack]);

  const loadTracks = async () => {
    setLoading(true);
    const result = await fetchMusicTracks({ publishedOnly: false });
    if (result.success) {
      setTracks(result.tracks);
    } else {
      toast({
        title: t('musicLibrary', 'error', 'Error'),
        description: result.error || t('musicLibrary', 'failedLoadLibrary', 'Failed to load music library'),
        variant: 'destructive'
      });
    }
    setLoading(false);
  };

  const loadFavorites = async () => {
    try {
      if (user) {
        const { data } = await supabase
          .from('user_profiles')
          .select('music_favorites')
          .eq('user_id', user.id)
          .single();
        if (data?.music_favorites) {
          setFavorites(data.music_favorites);
          localStorage.setItem('music_favorites', JSON.stringify(data.music_favorites));
          return;
        }
      }
      // Fallback to localStorage
      const stored = localStorage.getItem('music_favorites');
      if (stored) setFavorites(JSON.parse(stored));
    } catch (err) {
      const stored = localStorage.getItem('music_favorites');
      if (stored) setFavorites(JSON.parse(stored));
    }
  };

  const toggleFavorite = async (trackId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newFavorites = favorites.includes(trackId)
      ? favorites.filter(id => id !== trackId)
      : [...favorites, trackId];
    setFavorites(newFavorites);
    localStorage.setItem('music_favorites', JSON.stringify(newFavorites));
    if (user) {
      await supabase
        .from('user_profiles')
        .update({ music_favorites: newFavorites })
        .eq('user_id', user.id);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    const validation = validateAudioFile(file);
    if (!validation.valid) {
      toast({
        title: t('musicLibrary', 'invalidFile', 'Invalid File'),
        description: validation.error,
        variant: 'destructive'
      });
      return;
    }

    setUploading(true);
    
    const result = await uploadAndSaveTrack(file, {
      category: 'personal',
      is_published: true,
      is_public: true
    });

    if (result.success && result.track) {
      toast({
        title: t('musicLibrary', 'uploadSuccessful', 'Upload Successful'),
        description: t('musicLibrary', 'trackAddedToLibrary', '"{title}" has been added to your library.').replace('{title}', String(result.track.title))
      });
      loadTracks();
    } else {
      toast({
        title: t('musicLibrary', 'uploadFailed', 'Upload Failed'),
        description: result.error || t('musicLibrary', 'failedUploadAudio', 'Failed to upload audio file'),
        variant: 'destructive'
      });
    }

    setUploading(false);
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const playTrack = (track: MusicTrack) => {
    if (activeTrack?.id === track.id) {
      if (playing) {
        audioRef.current?.pause();
        setPlaying(false);
      } else {
        audioRef.current?.play();
        setPlaying(true);
      }
    } else {
      setActiveTrack(track);
      setPlaying(true);
      onSelectTrack?.(track);
    }
  };

  const previewTrackAudio = (track: MusicTrack, e: React.MouseEvent) => {
    e.stopPropagation();
    if (previewTrack?.id === track.id) {
      // Stop preview
      setPreviewTrack(null);
      if (audioRef.current) {
        audioRef.current.pause();
        setPlaying(false);
      }
    } else {
      setPreviewTrack(track);
      setActiveTrack(track);
      setPlaying(true);
    }
  };

  const selectAsBackgroundMusic = (track: MusicTrack, e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedTrackId === track.id) {
      onTrackSelected?.(null);
    } else {
      onTrackSelected?.(track);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (value: number[]) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  };

  const skipTrack = (direction: 'next' | 'prev') => {
    if (!activeTrack) return;
    const currentIndex = filtered.findIndex(item => item.id === activeTrack.id);
    let newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    if (newIndex >= filtered.length) newIndex = 0;
    if (newIndex < 0) newIndex = filtered.length - 1;
    const newTrack = filtered[newIndex];
    setActiveTrack(newTrack);
    setPlaying(true);
    onSelectTrack?.(newTrack);
  };

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const filtered = tracks.filter(item =>
    (category === 'all' || item.category === category) &&
    (item.title?.toLowerCase().includes(search.toLowerCase()) ||
     item.artist?.toLowerCase().includes(search.toLowerCase()))
  );

  const categories = ['all', 'worship', 'meditation', 'prayer', 'ambient', 'instrumental', 'personal'];

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          <div className="h-10 bg-gray-200 rounded flex-1 animate-pulse"></div>
          <div className="h-10 w-24 bg-gray-200 rounded animate-pulse"></div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
          ))}
        </div>
        <div className="grid gap-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-16 bg-gray-200 rounded animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Hidden Audio Element */}
      {activeTrack && (
        <audio
          ref={audioRef}
          src={activeTrack.file_url}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => skipTrack('next')}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          autoPlay
        />
      )}

      {/* Search and Upload */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input 
            placeholder={t('musicLibrary', 'searchMusicPlaceholder', 'Search music...')}
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            className="pl-9" 
          />
        </div>
        <label className="cursor-pointer">
          <Button variant="outline" disabled={uploading} asChild>
            <span>
              {uploading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              {uploading ? t('musicLibrary', 'uploading', 'Uploading...') : t('musicLibrary', 'upload', 'Upload')}
            </span>
          </Button>
          <input 
            ref={fileInputRef}
            type="file" 
            accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/aac,audio/m4a,audio/webm,audio/flac" 
            className="hidden" 
            onChange={handleUpload} 
          />
        </label>
      </div>

      {/* Categories */}
      <div className="flex gap-2 flex-wrap">
        {categories.map(c => (
          <Button 
            key={c} 
            size="sm" 
            variant={category === c ? 'default' : 'outline'} 
            onClick={() => setCategory(c)} 
            className="capitalize"
          >
            {c}
          </Button>
        ))}
      </div>

      {/* Selection Mode Info */}
      {selectionMode && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-blue-600" />
          <span className="text-sm text-blue-700">
            {t('musicLibrary', 'clickCheckmarkToSelect', 'Click the checkmark to select a track as background music')}
          </span>
        </div>
      )}

      {/* Now Playing */}
      {activeTrack && (
        <Card className="p-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
          <div className="flex items-center gap-4 mb-3">
            <div className="w-14 h-14 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
              {activeTrack.cover_image_url ? (
                <img 
                  src={activeTrack.cover_image_url} 
                  alt="" 
                  className="w-full h-full object-cover rounded-lg" 
                />
              ) : (
                <Music className="h-6 w-6" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{activeTrack.title}</p>
              <p className="text-sm text-white/70 truncate">{activeTrack.artist}</p>
            </div>
          </div>

          {/* Progress */}
          <div className="space-y-2 mb-3">
            <Slider
              value={[currentTime]}
              max={duration || 100}
              step={1}
              onValueChange={handleSeek}
              className="cursor-pointer"
            />
            <div className="flex justify-between text-xs text-white/70">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setIsMuted(!isMuted)} 
              className="text-white hover:bg-white/20"
            >
              {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </Button>
            
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => skipTrack('prev')} 
                className="text-white hover:bg-white/20"
              >
                <SkipBack className="h-5 w-5" />
              </Button>
              <Button 
                size="icon" 
                className="h-12 w-12 rounded-full bg-white text-purple-600 hover:bg-white/90"
                onClick={() => playTrack(activeTrack)}
              >
                {playing ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-1" />}
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => skipTrack('next')} 
                className="text-white hover:bg-white/20"
              >
                <SkipForward className="h-5 w-5" />
              </Button>
            </div>

            <Slider
              value={[isMuted ? 0 : volume]}
              max={100}
              step={1}
              onValueChange={(v) => setVolume(v[0])}
              className="w-20"
            />
          </div>
        </Card>
      )}

      {/* Track List */}
      <div className="grid gap-2 max-h-96 overflow-y-auto">
        {filtered.length === 0 ? (
          <Card className="p-8 text-center">
            <Music className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">{t('musicLibrary', 'noTracksFound', 'No tracks found')}</p>
            <p className="text-sm text-gray-400 mt-1">
              {tracks.length === 0
                ? t('musicLibrary', 'uploadToGetStarted', 'Upload some music to get started')
                : t('musicLibrary', 'adjustSearchOrFilter', 'Try adjusting your search or category filter')}
            </p>
            {tracks.length === 0 && (
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                {t('musicLibrary', 'uploadFirstTrack', 'Upload Your First Track')}
              </Button>
            )}
          </Card>
        ) : (
          filtered.map(track => (
            <Card 
              key={track.id} 
              className={`p-3 flex items-center gap-3 cursor-pointer transition-colors ${
                activeTrack?.id === track.id 
                  ? 'bg-purple-100 border-purple-300' 
                  : selectedTrackId === track.id
                    ? 'bg-green-50 border-green-300'
                    : 'hover:bg-purple-50'
              }`} 
              onClick={() => playTrack(track)}
            >
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                activeTrack?.id === track.id && playing
                  ? 'bg-purple-600'
                  : 'bg-gradient-to-br from-purple-500 to-indigo-600'
              }`}>
                {track.cover_image_url ? (
                  <img 
                    src={track.cover_image_url} 
                    alt="" 
                    className="w-full h-full object-cover rounded-lg" 
                  />
                ) : (
                  activeTrack?.id === track.id && playing ? 
                    <Pause className="h-5 w-5 text-white" /> : 
                    <Play className="h-5 w-5 text-white" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{track.title}</p>
                <p className="text-sm text-gray-500 truncate">{track.artist}</p>
              </div>
              
              {/* Action Buttons */}
              <div className="flex items-center gap-1">
                {/* Preview Button */}
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="text-gray-400 hover:text-purple-600"
                  onClick={(e) => previewTrackAudio(track, e)}
                  title={t('musicLibrary', 'preview', 'Preview')}
                >
                  {previewTrack?.id === track.id && playing ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </Button>

                {/* Selection Button (for background music selection) */}
                {selectionMode && (
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className={selectedTrackId === track.id ? 'text-green-600' : 'text-gray-400 hover:text-green-600'}
                    onClick={(e) => selectAsBackgroundMusic(track, e)}
                    title={selectedTrackId === track.id ? t('musicLibrary', 'selectedAsBackground', 'Selected as background music') : t('musicLibrary', 'selectAsBackground', 'Select as background music')}
                  >
                    <CheckCircle className={`h-4 w-4 ${selectedTrackId === track.id ? 'fill-green-100' : ''}`} />
                  </Button>
                )}

                {/* Favorite Button */}
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={favorites.includes(track.id) ? 'text-red-500' : 'text-gray-400 hover:text-red-500'}
                  onClick={(e) => toggleFavorite(track.id, e)}
                  title={favorites.includes(track.id) ? t('musicLibrary', 'removeFromFavorites', 'Remove from favorites') : t('musicLibrary', 'addToFavorites', 'Add to favorites')}
                >
                  <Heart className={`h-4 w-4 ${favorites.includes(track.id) ? 'fill-current' : ''}`} />
                </Button>
              </div>

              <span className="text-xs px-2 py-1 bg-gray-100 rounded capitalize hidden sm:inline">
                {track.category}
              </span>
            </Card>
          ))
        )}
      </div>

      {/* Selected Track Info */}
      {selectionMode && selectedTrackId && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium text-green-700">
                {t('musicLibrary', 'selectedLabel', 'Selected')}: {tracks.find(item => item.id === selectedTrackId)?.title}
              </span>
            </div>
            <Button 
              variant="ghost" 
              size="sm"
              className="text-green-600 hover:text-green-700"
              onClick={() => onTrackSelected?.(null)}
            >
              {t('musicLibrary', 'clear', 'Clear')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default MusicLibrary;
