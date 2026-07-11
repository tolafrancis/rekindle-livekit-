export interface Affirmation {
  id: string;
  category: string;
  title: string;
  content: string;
  scripture: string;
}

export const affirmations: Affirmation[] = [
  { id: '1', category: 'faith', title: 'Unwavering Faith', content: 'I walk by faith, not by sight. God is guiding my every step today.', scripture: '2 Corinthians 5:7' },
  { id: '2', category: 'faith', title: 'Mountain Mover', content: 'With faith as small as a mustard seed, I can move mountains in my life.', scripture: 'Matthew 17:20' },
  { id: '3', category: 'faith', title: 'Trust in the Lord', content: 'I trust in the Lord with all my heart and lean not on my own understanding.', scripture: 'Proverbs 3:5' },
  { id: '4', category: 'purpose', title: 'Divine Purpose', content: 'I am fearfully and wonderfully made. God has a unique purpose for my life.', scripture: 'Psalm 139:14' },
  { id: '5', category: 'purpose', title: 'Called & Chosen', content: 'I am chosen by God for a specific mission. My life has eternal significance.', scripture: '1 Peter 2:9' },
  { id: '6', category: 'purpose', title: 'Good Works', content: 'I am God\'s workmanship, created for good works prepared in advance.', scripture: 'Ephesians 2:10' },
  { id: '7', category: 'boldness', title: 'Spirit of Power', content: 'God has not given me a spirit of fear, but of power, love, and a sound mind.', scripture: '2 Timothy 1:7' },
  { id: '8', category: 'boldness', title: 'Lion-Hearted', content: 'The righteous are as bold as a lion. I speak truth with courage today.', scripture: 'Proverbs 28:1' },
  { id: '9', category: 'boldness', title: 'Fearless', content: 'I will not fear, for God is with me. He strengthens and helps me.', scripture: 'Isaiah 41:10' },
  { id: '10', category: 'purity', title: 'Clean Heart', content: 'Create in me a clean heart, O God. I pursue purity in thought and action.', scripture: 'Psalm 51:10' },
  { id: '11', category: 'purity', title: 'Temple of God', content: 'My body is a temple of the Holy Spirit. I honor God with my choices.', scripture: '1 Corinthians 6:19' },
  { id: '12', category: 'spiritual_gifts', title: 'Gifted for Service', content: 'I am uniquely gifted by the Spirit to serve and build up the body of Christ.', scripture: '1 Corinthians 12:7' },
  { id: '13', category: 'spiritual_gifts', title: 'Empowered', content: 'The same power that raised Christ from the dead lives in me.', scripture: 'Romans 8:11' },
  { id: '14', category: 'peace', title: 'Perfect Peace', content: 'God keeps me in perfect peace as I keep my mind stayed on Him.', scripture: 'Isaiah 26:3' },
  { id: '15', category: 'peace', title: 'Peace Beyond Understanding', content: 'The peace of God guards my heart and mind in Christ Jesus.', scripture: 'Philippians 4:7' },
];

export const getRandomAffirmation = (category?: string): Affirmation => {
  const filtered = category ? affirmations.filter(a => a.category === category) : affirmations;
  return filtered[Math.floor(Math.random() * filtered.length)];
};

export const getDailyAffirmation = (): Affirmation => {
  const today = new Date();
  const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000);
  return affirmations[dayOfYear % affirmations.length];
};
