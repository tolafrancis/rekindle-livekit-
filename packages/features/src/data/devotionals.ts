export interface Devotional {
  id: string;
  title: string;
  scripture: string;
  excerpt: string;
  duration: string;
  language: string;
  imageUrl: string;
  modules: number;
}

export const devotionals: Devotional[] = [
  { id: '1', title: 'Walking in Faith', scripture: 'Hebrews 11:1', excerpt: 'Discover the power of unwavering faith in your daily walk', duration: '15 min', language: 'English', modules: 7, imageUrl: 'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1764231138080_5aef9530.webp' },
  { id: '2', title: 'Grace Abounds', scripture: '2 Corinthians 12:9', excerpt: 'Experience the sufficiency of divine grace in weakness', duration: '12 min', language: 'English', modules: 5, imageUrl: 'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1764231140005_7ac42abb.webp' },
  { id: '3', title: 'Peace Beyond Understanding', scripture: 'Philippians 4:7', excerpt: 'Find tranquility in the midst of life\'s storms', duration: '18 min', language: 'English', modules: 8, imageUrl: 'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1764231141907_5b3530b6.webp' },
  { id: '4', title: 'Love Without Limits', scripture: '1 Corinthians 13:8', excerpt: 'Explore the boundless nature of divine love', duration: '14 min', language: 'Spanish', modules: 6, imageUrl: 'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1764231143844_53b2e7c4.webp' },
  { id: '5', title: 'Strength in Weakness', scripture: 'Isaiah 40:31', excerpt: 'Renew your strength through spiritual discipline', duration: '16 min', language: 'English', modules: 7, imageUrl: 'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1764231145733_61836854.webp' },
  { id: '6', title: 'Joy in the Morning', scripture: 'Psalm 30:5', excerpt: 'Embrace the promise of renewed joy each day', duration: '13 min', language: 'French', modules: 5, imageUrl: 'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1764231147637_8ff09368.webp' },
  { id: '7', title: 'Forgiveness Flows', scripture: 'Ephesians 4:32', excerpt: 'Learn the transformative power of forgiveness', duration: '17 min', language: 'English', modules: 8, imageUrl: 'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1764231149566_407491b4.webp' },
  { id: '8', title: 'Hope Anchors the Soul', scripture: 'Hebrews 6:19', excerpt: 'Build your life on the firm foundation of hope', duration: '15 min', language: 'English', modules: 6, imageUrl: 'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1764231151505_a1e0c1ce.webp' },
  { id: '9', title: 'Wisdom from Above', scripture: 'James 3:17', excerpt: 'Seek divine wisdom for life\'s complex decisions', duration: '19 min', language: 'Spanish', modules: 9, imageUrl: 'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1764231153521_97523178.webp' }
];
