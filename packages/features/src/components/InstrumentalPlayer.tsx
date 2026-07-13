import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Slider } from '@rekindle/ui/slider';
import { toast } from '@rekindle/ui/use-toast';
import { supabase } from '@rekindle/supabase';
import { useLanguage } from '../LanguageContext';
import { useAuth } from '../AuthContext';
import {
  uploadAndSaveTrack,
  fetchMusicTracks,
  validateAudioFile,
  MusicTrack
} from '../musicStorage';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Repeat,
  Music,
  Upload,
  Loader2,
  Shuffle
} from 'lucide-react';

interface InstrumentalPlayerProps {
  onTrackChange?: (track: MusicTrack | null) => void;
  initialTrackUrl?: string;
  autoPlay?: boolean;
  /** Max personal uploads for the current member (undefined = unlimited). */
  uploadLimit?: number;
}

const formatDuration = (s: number) => {
  if (!isFinite(s) || isNaN(s)) return '0:00';
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
};

export const InstrumentalPlayer: React.FC<InstrumentalPlayerProps> = ({
  onTrackChange,
  initialTrackUrl,
  autoPlay = false,
  uploadLimit
}) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [currentTrack, setCurrentTrack] = useState<MusicTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(50);
  const [isMuted, setIsMuted] = useState(false);
  const [isLooping, setIsLooping] = useState(true);
  const [isShuffle, setIsShuffle] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [selectedGenre, setSelectedGenre] = useState('all');
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadTracks();
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume / 100;
    }
  }, [volume, isMuted]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.loop = isLooping && !isShuffle;
    }
  }, [isLooping, isShuffle]);

  // Handle initial track URL
  useEffect(() => {
    if (initialTrackUrl && tracks.length > 0) {
      const matchingTrack = tracks.find(item => item.file_url === initialTrackUrl);
      if (matchingTrack && !currentTrack) {
        setCurrentTrack(matchingTrack);
        if (autoPlay) {
          setTimeout(() => {
            audioRef.current?.play();
            setIsPlaying(true);
          }, 100);
        }
      }
    }
  }, [initialTrackUrl, tracks, autoPlay]);

  const loadTracks = async () => {
    setLoading(true);
    const result = await fetchMusicTracks({ publishedOnly: false });
    if (result.success) {
      setTracks(result.tracks);
      if (result.tracks.length > 0 && !currentTrack) {
        setCurrentTrack(result.tracks[0]);
      }
    } else {
      console.error('Failed to load tracks:', result.error);
    }
    setLoading(false);
  };

  const togglePlay = () => {
    if (!audioRef.current || !currentTrack) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const playTrack = (track: MusicTrack) => {
    setCurrentTrack(track);
    setIsPlaying(true);
    onTrackChange?.(track);
    setTimeout(() => audioRef.current?.play(), 100);
  };

  const nextTrack = () => {
    if (!currentTrack || filteredTracks.length === 0) return;

    if (isShuffle) {
      const randomIndex = Math.floor(Math.random() * filteredTracks.length);
      playTrack(filteredTracks[randomIndex]);
    } else {
      const idx = filteredTracks.findIndex(item => item.id === currentTrack.id);
      playTrack(filteredTracks[(idx + 1) % filteredTracks.length]);
    }
  };

  const prevTrack = () => {
    if (!currentTrack || filteredTracks.length === 0) return;
    const idx = filteredTracks.findIndex(item => item.id === currentTrack.id);
    playTrack(filteredTracks[(idx - 1 + filteredTracks.length) % filteredTracks.length]);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      setDuration(audioRef.current.duration || 0);
    }
  };

  const handleSeek = (value: number[]) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  };

  const handleEnded = () => {
    if (isShuffle || !isLooping) {
      nextTrack();
    }
    // If looping and not shuffle, the audio element handles it
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Per-member upload quota (e.g. ministry members are capped at 10 personal tracks).
    if (uploadLimit && user?.id) {
      const { count } = await supabase
        .from('background_music')
        .select('id', { count: 'exact', head: true })
        .eq('uploaded_by', user.id)
        .eq('category', 'personal');
      if ((count ?? 0) >= uploadLimit) {
        toast({
          title: t('instrumentalPlayer', 'uploadLimitTitle', 'Upload limit reached'),
          description: t('instrumentalPlayer', 'uploadLimitDesc', 'You can upload up to {n} tracks. Remove one to add another.').replace('{n}', String(uploadLimit)),
          variant: 'destructive'
        });
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
    }

    // Validate file
    const validation = validateAudioFile(file);
    if (!validation.valid) {
      toast({
        title: t('instrumentalPlayer', 'invalidFile', 'Invalid File'),
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
        title: t('instrumentalPlayer', 'uploadSuccessful', 'Upload Successful'),
        description: t('instrumentalPlayer', 'trackAddedToLibrary', '"{title}" has been added to your library.').replace('{title}', String(result.track.title))
      });
      loadTracks();
    } else {
      toast({
        title: t('instrumentalPlayer', 'uploadFailed', 'Upload Failed'),
        description: result.error || t('instrumentalPlayer', 'failedToUploadAudio', 'Failed to upload audio file'),
        variant: 'destructive'
      });
    }

    setUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const genres = ['all', 'worship', 'piano', 'ambient', 'instrumental', 'meditation', 'personal'];
  const filteredTracks = selectedGenre === 'all'
    ? tracks
    : tracks.filter(item => item.category === selectedGenre);

  if (loading) {
    return (
      <div className="space-y-6">
        <Card className="bg-gradient-to-br from-purple-900 to-purple-700 text-white overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {currentTrack && (
        <audio
          ref={audioRef}
          src={currentTrack.file_url}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />
      )}

      {/* Now Playing Card */}
      <Card className="bg-gradient-to-br from-purple-900 to-purple-700 text-white overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 bg-white/20 rounded-lg flex items-center justify-center">
              {currentTrack?.cover_image_url ? (
                <img
                  src={currentTrack.cover_image_url}
                  alt=""
                  className="w-full h-full object-cover rounded-lg"
                />
              ) : (
                <Music className="h-8 w-8" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-lg truncate">
                {currentTrack?.title || t('instrumentalPlayer', 'noTrackSelected', 'No track selected')}
              </h3>
              <p className="text-white/70 text-sm truncate">
                {currentTrack?.artist || t('instrumentalPlayer', 'unknownArtist', 'Unknown Artist')}
                {currentTrack?.category && ` • ${currentTrack.category}`}
              </p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2 mb-4">
            <Slider
              value={[currentTime]}
              max={duration || 100}
              step={1}
              onValueChange={handleSeek}
              className="cursor-pointer"
            />
            <div className="flex justify-between text-xs text-white/60">
              <span>{formatDuration(currentTime)}</span>
              <span>{formatDuration(duration)}</span>
            </div>
          </div>

          {/* Playback Controls */}
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={prevTrack}
              className="text-white hover:bg-white/20"
              disabled={filteredTracks.length === 0}
            >
              <SkipBack className="h-5 w-5" />
            </Button>
            <Button
              size="icon"
              onClick={togglePlay}
              className="h-14 w-14 rounded-full bg-white text-purple-700 hover:bg-white/90"
              disabled={!currentTrack}
            >
              {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-1" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={nextTrack}
              className="text-white hover:bg-white/20"
              disabled={filteredTracks.length === 0}
            >
              <SkipForward className="h-5 w-5" />
            </Button>
          </div>

          {/* Secondary Controls */}
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsLooping(!isLooping)}
                className={`text-white ${isLooping ? 'bg-white/20' : 'hover:bg-white/10'}`}
                title={isLooping ? t('instrumentalPlayer', 'loopOn', 'Loop on') : t('instrumentalPlayer', 'loopOff', 'Loop off')}
              >
                <Repeat className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsShuffle(!isShuffle)}
                className={`text-white ${isShuffle ? 'bg-white/20' : 'hover:bg-white/10'}`}
                title={isShuffle ? t('instrumentalPlayer', 'shuffleOn', 'Shuffle on') : t('instrumentalPlayer', 'shuffleOff', 'Shuffle off')}
              >
                <Shuffle className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsMuted(!isMuted)}
                className="text-white hover:bg-white/10"
              >
                {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </Button>
              <Slider
                value={[isMuted ? 0 : volume]}
                max={100}
                onValueChange={(v) => setVolume(v[0])}
                className="w-24"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Music Library */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-lg">{t('instrumentalPlayer', 'musicLibrary', 'Music Library')}</CardTitle>
            <label className="cursor-pointer">
              <Button variant="outline" size="sm" disabled={uploading} asChild>
                <span>
                  {uploading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  {uploading ? t('instrumentalPlayer', 'uploading', 'Uploading...') : t('instrumentalPlayer', 'upload', 'Upload')}
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
          <div className="flex gap-2 flex-wrap mt-2">
            {genres.map(g => (
              <Button
                key={g}
                variant={selectedGenre === g ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedGenre(g)}
                className="capitalize"
              >
                {g}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-2 max-h-64 overflow-y-auto">
          {filteredTracks.length === 0 ? (
            <div className="text-center py-8">
              <Music className="h-12 w-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">{t('instrumentalPlayer', 'noTracksFound', 'No tracks found')}</p>
              <p className="text-sm text-gray-400 mt-1">
                {tracks.length === 0
                  ? t('instrumentalPlayer', 'uploadToGetStarted', 'Upload some music to get started')
                  : t('instrumentalPlayer', 'trySelectingDifferentCategory', 'Try selecting a different category')}
              </p>
              {tracks.length === 0 && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {t('instrumentalPlayer', 'uploadMusic', 'Upload Music')}
                </Button>
              )}
            </div>
          ) : (
            filteredTracks.map(track => (
              <div
                key={track.id}
                onClick={() => playTrack(track)}
                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                  currentTrack?.id === track.id
                    ? 'bg-purple-100 border border-purple-200'
                    : 'hover:bg-gray-100'
                }`}
              >
                <div className={`w-10 h-10 rounded flex items-center justify-center ${
                  currentTrack?.id === track.id && isPlaying
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}>
                  {currentTrack?.id === track.id && isPlaying ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{track.title}</p>
                  <p className="text-xs text-gray-500 truncate">{track.artist}</p>
                </div>
                <span className="text-xs px-2 py-1 rounded bg-gray-100 capitalize hidden sm:inline">
                  {track.category}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default InstrumentalPlayer;
