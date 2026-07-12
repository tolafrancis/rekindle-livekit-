// Re-export from counsellors for backward compatibility
export { Counsellor as Mentor, counsellors as mentors } from './counsellors';
export type { Counsellor } from './counsellors';

// Legacy interface for backward compatibility
export interface Mentor {
  id: string;
  name: string;
  specializations: string[];
  languages: string[];
  rating: number;
  converts: number;
  imageUrl: string;
  bio: string;
  voiceEnabled: boolean;
}
