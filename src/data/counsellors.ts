// Counsellor data - renamed from Mentor terminology
export interface Counsellor {
  id: string;
  name: string;
  specializations: string[];
  languages: string[];
  rating: number;
  sessions: number;
  imageUrl: string;
  bio: string;
  voiceEnabled: boolean;
  // Database fields
  title?: string;
  specialty?: string;
  avatar_url?: string;
  email?: string;
  phone?: string;
  is_available?: boolean;
  hourly_rate?: number;
  total_sessions?: number;
  is_verified?: boolean;
}

// Alias for backward compatibility
export type Mentor = Counsellor;

export const counsellors: Counsellor[] = [
  { id: '1', name: 'Pastor Michael Chen', specializations: ['Discipleship', 'Recovery'], languages: ['English', 'Mandarin'], rating: 4.9, sessions: 23, imageUrl: 'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1764231154424_4870e407.webp', bio: 'Helping believers grow for 15 years', voiceEnabled: true },
  { id: '2', name: 'Rev. Sarah Johnson', specializations: ['Prayer', 'Counseling'], languages: ['English', 'Spanish'], rating: 4.8, sessions: 31, imageUrl: 'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1764231156363_b4372d14.webp', bio: 'Passionate about spiritual formation', voiceEnabled: true },
  { id: '3', name: 'Elder David Martinez', specializations: ['Youth', 'Leadership'], languages: ['Spanish', 'English'], rating: 4.7, sessions: 18, imageUrl: 'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1764231158253_509d6110.webp', bio: 'Empowering the next generation', voiceEnabled: false },
  { id: '4', name: 'Dr. Grace Okafor', specializations: ['Healing', 'Deliverance'], languages: ['English', 'Yoruba'], rating: 5.0, sessions: 42, imageUrl: 'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1764231160132_d4b6bfcc.webp', bio: 'Ministering freedom and wholeness', voiceEnabled: true },
  { id: '5', name: 'Pastor James Kim', specializations: ['Marriage', 'Family'], languages: ['Korean', 'English'], rating: 4.9, sessions: 27, imageUrl: 'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1764231163180_f3d8407d.webp', bio: 'Strengthening families in faith', voiceEnabled: true },
  { id: '6', name: 'Sister Maria Lopez', specializations: ['Women', 'Prayer'], languages: ['Spanish', 'Portuguese'], rating: 4.8, sessions: 35, imageUrl: 'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1764231165334_76241188.webp', bio: 'Equipping women for ministry', voiceEnabled: false },
  { id: '7', name: 'Rev. Thomas Brown', specializations: ['Evangelism', 'Discipleship'], languages: ['English', 'French'], rating: 4.6, sessions: 19, imageUrl: 'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1764231168424_8205b191.webp', bio: 'Passionate soul winner', voiceEnabled: true },
  { id: '8', name: 'Pastor Ruth Nguyen', specializations: ['Worship', 'Intercession'], languages: ['Vietnamese', 'English'], rating: 4.9, sessions: 29, imageUrl: 'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1764231170511_e1cb079e.webp', bio: 'Leading others into His presence', voiceEnabled: true },
  { id: '9', name: 'Elder John Williams', specializations: ['Teaching', 'Mentorship'], languages: ['English'], rating: 4.7, sessions: 21, imageUrl: 'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1764231172844_a23cbc64.webp', bio: 'Building strong foundations', voiceEnabled: false }
];

// Backward compatibility alias
export const mentors = counsellors;
