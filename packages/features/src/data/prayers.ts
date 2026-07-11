export interface PrayerTopic {
  id: string;
  name: string;
  imageUrl: string;
  count: number;
}

export interface PrayerPoint {
  id: string;
  topicId: string;
  title: string;
  body: string;
  scripture: string;
  scriptureText?: string;
  intensity: 'light' | 'medium' | 'deep';
}
export const prayerTopics: PrayerTopic[] = [
  { id: '1', name: 'Healing & Health', imageUrl: 'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1764231174458_65154b27.webp', count: 42 },
  { id: '2', name: 'Guidance & Direction', imageUrl: 'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1764231177828_7f124185.webp', count: 38 },
  { id: '3', name: 'Gratitude & Praise', imageUrl: 'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1764231179725_439f9d04.webp', count: 51 },
  { id: '4', name: 'Protection & Safety', imageUrl: 'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1764231182923_3bbb84ca.webp', count: 35 },
  { id: '5', name: 'Breakthrough & Victory', imageUrl: 'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1764231186122_e63b58f3.webp', count: 44 },
  { id: '6', name: 'Family & Relationships', imageUrl: 'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1764231189457_c14d5515.webp', count: 39 }
];

export const prayerPoints: PrayerPoint[] = [
  { id: '1', topicId: '1', title: 'Divine Healing', body: 'Lord, by Your stripes we are healed. Touch every area of sickness and restore complete health.', scripture: 'Isaiah 53:5', scriptureText: 'But he was pierced for our transgressions, he was crushed for our iniquities; the punishment that brought us peace was on him, and by his wounds we are healed.', intensity: 'deep' },
  { id: '2', topicId: '1', title: 'Strength for Recovery', body: 'Grant supernatural strength during this recovery season. Renew body, mind, and spirit.', scripture: 'Psalm 103:3', scriptureText: 'Who forgives all your sins and heals all your diseases.', intensity: 'medium' },
  { id: '3', topicId: '2', title: 'Clear Direction', body: 'Father, illuminate the path ahead. Make Your will crystal clear in every decision.', scripture: 'Proverbs 3:5-6', scriptureText: 'Trust in the LORD with all your heart and lean not on your own understanding; in all your ways submit to him, and he will make your paths straight.', intensity: 'medium' },
  { id: '4', topicId: '2', title: 'Wisdom for Choices', body: 'Pour out wisdom from above for the crossroads I face. Guide my steps.', scripture: 'James 1:5', scriptureText: 'If any of you lacks wisdom, you should ask God, who gives generously to all without finding fault, and it will be given to you.', intensity: 'light' },
  { id: '5', topicId: '3', title: 'Thankful Heart', body: 'I magnify Your name for countless blessings. You are worthy of all praise.', scripture: 'Psalm 100:4', scriptureText: 'Enter his gates with thanksgiving and his courts with praise; give thanks to him and praise his name.', intensity: 'light' },
  { id: '6', topicId: '3', title: 'Celebration of Victory', body: 'Thank You for victories seen and unseen. Your faithfulness endures forever.', scripture: '1 Chronicles 16:34', scriptureText: 'Give thanks to the LORD, for he is good; his love endures forever.', intensity: 'medium' },
  { id: '7', topicId: '4', title: 'Shield of Protection', body: 'Surround me with Your divine protection. Guard my coming and going.', scripture: 'Psalm 91:11', scriptureText: 'For he will command his angels concerning you to guard you in all your ways.', intensity: 'deep' },
  { id: '8', topicId: '5', title: 'Breaking Barriers', body: 'Demolish every obstacle standing between me and my destiny. Open impossible doors.', scripture: '2 Corinthians 10:4', scriptureText: 'The weapons we fight with are not the weapons of the world. On the contrary, they have divine power to demolish strongholds.', intensity: 'deep' },
  { id: '9', topicId: '6', title: 'Family Unity', body: 'Bind our family together in love. Heal divisions and strengthen our bonds.', scripture: 'Colossians 3:14', scriptureText: 'And over all these virtues put on love, which binds them all together in perfect unity.', intensity: 'medium' }
];
