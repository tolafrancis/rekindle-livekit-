export interface Book {
  id: string;
  title: string;
  author: string;
  category: string;
  coverImage: string;
  summary: string;
  keyTakeaways: string[];
  relatedPrayers: string[];
  rating: number;
  readTime: string;
  audioSummaryUrl?: string;
  audioDuration?: string;
}

export const books: Book[] = [
  { 
    id: '1', 
    title: 'The Purpose Driven Life', 
    author: 'Rick Warren', 
    category: 'Christian Living', 
    coverImage: '', 
    summary: 'A groundbreaking manifesto on the meaning of life. Rick Warren guides readers through a 40-day spiritual journey to discover their God-given purpose. This book has transformed millions of lives worldwide by answering life\'s most fundamental question: "What on earth am I here for?" Warren presents five purposes that God has for every person, helping readers understand that life is not about them but about living for God\'s purposes.', 
    keyTakeaways: ['You were planned for God\'s pleasure', 'You were formed for God\'s family', 'You were created to become like Christ', 'You were shaped for serving God', 'You were made for a mission'], 
    relatedPrayers: ['Purpose Discovery', 'Divine Guidance'], 
    rating: 4.8, 
    readTime: '12 min',
    audioSummaryUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    audioDuration: '8:45'
  },
  { 
    id: '2', 
    title: 'Mere Christianity', 
    author: 'C.S. Lewis', 
    category: 'Apologetics', 
    coverImage: '', 
    summary: 'A rational defense of the Christian faith. Lewis presents the core beliefs that unite Christians across denominations. Originally delivered as BBC radio talks during World War II, this book remains one of the most popular and influential works of Christian apologetics ever written. Lewis uses logic, wit, and profound insight to explain and defend the beliefs that are common to nearly all Christians.', 
    keyTakeaways: ['The Moral Law points to God', 'Christianity explains human nature', 'Faith and reason work together', 'Christian virtues transform character', 'The choice between good and evil is real'], 
    relatedPrayers: ['Faith Strengthening', 'Wisdom'], 
    rating: 4.9, 
    readTime: '15 min',
    audioSummaryUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    audioDuration: '10:30'
  },
  { 
    id: '3', 
    title: 'The Power of a Praying Life', 
    author: 'Stormie Omartian', 
    category: 'Prayer', 
    coverImage: '', 
    summary: 'Transform your prayer life with practical guidance on developing a deeper, more powerful connection with God. Stormie Omartian shares her personal journey and provides biblical foundations for effective prayer. This book teaches readers how to pray with confidence, knowing that God hears and answers prayers according to His perfect will.', 
    keyTakeaways: ['Prayer changes everything', 'Consistency builds spiritual strength', 'Pray with Scripture', 'Intercession for others transforms lives', 'Praise opens doors to God\'s presence'], 
    relatedPrayers: ['Prayer Life', 'Intercession'], 
    rating: 4.7, 
    readTime: '10 min',
    audioSummaryUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    audioDuration: '7:20'
  },
  { 
    id: '4', 
    title: 'Boundaries', 
    author: 'Dr. Henry Cloud', 
    category: 'Christian Living', 
    coverImage: '', 
    summary: 'Learn when to say yes and how to say no to take control of your life while honoring God and others. Dr. Cloud provides biblical wisdom for establishing healthy boundaries in all relationships. This book helps readers understand that boundaries are not walls but fences with gates - they define who you are and what you are responsible for.', 
    keyTakeaways: ['Healthy boundaries honor God', 'Saying no is not selfish', 'Boundaries protect relationships', 'Personal responsibility matters', 'Love requires limits'], 
    relatedPrayers: ['Wisdom', 'Relationships'], 
    rating: 4.6, 
    readTime: '14 min',
    audioSummaryUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
    audioDuration: '9:15'
  },
  { 
    id: '5', 
    title: 'Knowing God', 
    author: 'J.I. Packer', 
    category: 'Theology', 
    coverImage: '', 
    summary: 'A classic exploration of who God is and how we can know Him personally through Scripture and relationship. Packer distinguishes between knowing about God and actually knowing God, leading readers into a deeper, more intimate relationship with their Creator. This book has been called one of the most important Christian books of the 20th century.', 
    keyTakeaways: ['God desires relationship with us', 'Knowing about God vs knowing God', 'God\'s attributes reveal His character', 'Adoption into God\'s family', 'God\'s guidance is personal and real'], 
    relatedPrayers: ['Intimacy with God', 'Understanding'], 
    rating: 4.9, 
    readTime: '18 min',
    audioSummaryUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
    audioDuration: '12:00'
  },
  { 
    id: '6', 
    title: 'Radical', 
    author: 'David Platt', 
    category: 'Discipleship', 
    coverImage: '', 
    summary: 'A call to return to the radical demands of following Jesus and abandoning the American Dream for the gospel. Platt challenges readers to consider what they would give up for Christ and presents a compelling vision for authentic discipleship that mirrors the early church\'s commitment to Jesus.', 
    keyTakeaways: ['Jesus demands everything', 'Comfortable Christianity is not biblical', 'Global mission is every believer\'s call', 'Sacrifice leads to true joy', 'The gospel is worth dying for'], 
    relatedPrayers: ['Surrender', 'Mission'], 
    rating: 4.7, 
    readTime: '13 min',
    audioSummaryUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3',
    audioDuration: '8:50'
  },
  { 
    id: '7', 
    title: 'Celebration of Discipline', 
    author: 'Richard Foster', 
    category: 'Spiritual Growth', 
    coverImage: '', 
    summary: 'A comprehensive guide to the classical spiritual disciplines that lead to inner transformation. Foster explores inward disciplines (meditation, prayer, fasting, study), outward disciplines (simplicity, solitude, submission, service), and corporate disciplines (confession, worship, guidance, celebration).', 
    keyTakeaways: ['Disciplines are pathways to grace', 'Meditation deepens faith', 'Simplicity frees the soul', 'Community strengthens growth', 'Celebration is a discipline'], 
    relatedPrayers: ['Spiritual Disciplines', 'Growth'], 
    rating: 4.8, 
    readTime: '16 min',
    audioSummaryUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3',
    audioDuration: '11:30'
  },
  { 
    id: '8', 
    title: 'The Screwtape Letters', 
    author: 'C.S. Lewis', 
    category: 'Fiction', 
    coverImage: '', 
    summary: 'A satirical masterpiece revealing spiritual warfare through letters from a senior demon to his nephew. Lewis brilliantly exposes the subtle tactics of temptation and the nature of spiritual battle, all while providing profound insights into human nature and the Christian life.', 
    keyTakeaways: ['Spiritual warfare is real', 'Small compromises lead to destruction', 'Pleasure is God\'s invention', 'Pride is the ultimate sin', 'Distraction is a powerful weapon'], 
    relatedPrayers: ['Spiritual Protection', 'Discernment'], 
    rating: 4.9, 
    readTime: '11 min',
    audioSummaryUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
    audioDuration: '7:45'
  },
];
