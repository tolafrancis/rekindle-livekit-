export interface InstrumentalTrack {
  id: string;
  title: string;
  genre: 'soaking' | 'piano' | 'strings' | 'ambient' | 'pads';
  mood: 'calm' | 'reflective' | 'intense' | 'deep prayer';
  duration_seconds: number;
  file_url: string;
  tags: string[];
  is_downloadable: boolean;
}

export const instrumentalTracks: 
InstrumentalTrack[] = [
  {
    id: '1',
    title: 'Worship instrumental',
    genre: 'soaking',
    mood: 'calm',
    duration_seconds: 240,
    
file_url: 'https://vpnpembyqbbaaiynfvli.supabase.co/storage/v1/object/public/background-music/background-music/music/1769357398751_Steve-McCracken-Worship-Instrumental.mp3',
   
 tags: ['prayer', 'meditation'],
    is_downloadable: true,
  },
  {
    id: '2',
    title: 'Heavenly Piano',
    genre: 'piano',
    mood: 'reflective',
    duration_seconds: 300,
   
 file_url: 'https://vpnpembyqbbaaiynfvli.supabase.co/storage/v1/object/public/admin-content/music/1781232678809_Candlelit_Sanctuary.mp3',
    tags: ['worship', 'prayer'],
    is_downloadable: true,
  },
  {
    
id: '3',
    title: 'Strings of Grace',
    genre: 'strings',
    mood: 'calm',
    duration_seconds: 280,
    
file_url: 'https://https://vpnpembyqbbaaiynfvli.supabase.co/storage/v1/object/public/admin-content/music/1781242002338_Candlelit_Sanctuary_(2).mp3',
    tags: ['meditation', 'sleep'],
    is_downloadable: true,
  },
  {
    id: 
'4',
    title: 'Ambient Worship',
    genre: 'ambient',
    mood: 'deep prayer',
    duration_seconds: 360,
  
 file_url: 'https://vpnpembyqbbaaiynfvli.supabase.co/storage/v1/object/public/admin-content/music/1781432045374_Deep_Prayer_Drift.mp3',
    tags: ['deep prayer', 'soaking'],
    is_downloadable: true,
  },
  
{
    id: '5',
    title: 'Gentle Pads',
    genre: 'pads',
    mood: 'calm',
    duration_seconds: 320,
    
file_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
    tags: ['background', 'prayer'],
    is_downloadable: true,
  },
  {
    
id: '6',
    title: 'Morning Devotion',
    genre: 'piano',
    mood: 'reflective',
    duration_seconds: 270,
    
file_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3',
    tags: ['devotional', 'morning'],
    is_downloadable: true,
  },
  {
    id: '7',
    title: 'Deep Intercession',
    genre: 'soaking',
    mood: 'intense',
    duration_seconds: 400,
    file_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3',
    tags: ['intercession', 'warfare'],
    is_downloadable: true,
  },
  {
    id: '8',
    title: 'Rest in Him',
    genre: 'ambient',
    mood: 'calm',
    duration_seconds: 350,
    file_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
    tags: ['rest', 'sleep', 'meditation'],
    is_downloadable: true,
  },
];

export const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};
