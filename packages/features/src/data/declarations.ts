export interface Declaration {
  id: string;
  category: string;
  title: string;
  content: string;
  scripture: string;
}

export const declarations: Declaration[] = [
  { id: '1', category: 'protection', title: 'Divine Protection', content: 'I declare that no weapon formed against me shall prosper. Every tongue that rises against me in judgment shall be condemned.', scripture: 'Isaiah 54:17' },
  { id: '2', category: 'protection', title: 'Safe Under Wings', content: 'I declare that I dwell in the shelter of the Most High and rest in the shadow of the Almighty.', scripture: 'Psalm 91:1' },
  { id: '3', category: 'protection', title: 'Guardian Angels', content: 'I declare that God commands His angels concerning me to guard me in all my ways.', scripture: 'Psalm 91:11' },
  { id: '4', category: 'victory', title: 'Overwhelming Victory', content: 'I declare that in all things I am more than a conqueror through Christ who loves me.', scripture: 'Romans 8:37' },
  { id: '5', category: 'victory', title: 'Victory is Mine', content: 'I declare that the battle is the Lord\'s and victory is mine. I walk in triumph today.', scripture: '1 Samuel 17:47' },
  { id: '6', category: 'victory', title: 'Christ in Me', content: 'I declare that Christ in me is greater than any challenge I face. I overcome by His power.', scripture: '1 John 4:4' },
  { id: '7', category: 'prosperity', title: 'Abundant Provision', content: 'I declare that my God shall supply all my needs according to His riches in glory.', scripture: 'Philippians 4:19' },
  { id: '8', category: 'prosperity', title: 'Prosperity and Success', content: 'I declare that I prosper in all I do. Success and good fortune follow me.', scripture: 'Joshua 1:8' },
  { id: '9', category: 'prosperity', title: 'Blessed Coming and Going', content: 'I declare that I am blessed when I come in and blessed when I go out.', scripture: 'Deuteronomy 28:6' },
  { id: '10', category: 'health', title: 'Divine Healing', content: 'I declare that by Jesus\' stripes I am healed. Divine health flows through my body.', scripture: 'Isaiah 53:5' },
  { id: '11', category: 'health', title: 'Long Life', content: 'I declare that God satisfies me with long life and shows me His salvation.', scripture: 'Psalm 91:16' },
  { id: '12', category: 'health', title: 'Renewed Strength', content: 'I declare that my youth is renewed like the eagle\'s. I am strong and healthy.', scripture: 'Psalm 103:5' },
  { id: '13', category: 'authority', title: 'Kingdom Authority', content: 'I declare that I have authority to trample on serpents and scorpions and over all the power of the enemy.', scripture: 'Luke 10:19' },
  { id: '14', category: 'authority', title: 'Binding and Loosing', content: 'I declare that whatever I bind on earth is bound in heaven, and whatever I loose on earth is loosed in heaven.', scripture: 'Matthew 18:18' },
  { id: '15', category: 'authority', title: 'Royal Priesthood', content: 'I declare that I am part of a chosen generation, a royal priesthood, a holy nation.', scripture: '1 Peter 2:9' },
  { id: '16', category: 'breakthrough', title: 'Breaking Barriers', content: 'I declare that every barrier is broken in my life. I experience breakthrough today.', scripture: '2 Samuel 5:20' },
  { id: '17', category: 'breakthrough', title: 'New Thing', content: 'I declare that God is doing a new thing in my life. A way is made in the wilderness.', scripture: 'Isaiah 43:19' },
  { id: '18', category: 'breakthrough', title: 'Impossible Made Possible', content: 'I declare that nothing is impossible with God. What seems impossible becomes possible.', scripture: 'Luke 1:37' },
];

export const getRandomDeclaration = (category?: string): Declaration => {
  const filtered = category ? declarations.filter(d => d.category === category) : declarations;
  return filtered[Math.floor(Math.random() * filtered.length)];
};

export const getDailyDeclaration = (): Declaration => {
  const today = new Date();
  const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000);
  return declarations[dayOfYear % declarations.length];
};
