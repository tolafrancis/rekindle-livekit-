export interface BibleVerse {
  reference: string;
  text: string;
  version: string;
}

export interface BibleVersion {
  id: string;
  name: string;
  abbreviation: string;
}

export const bibleVersions: BibleVersion[] = [
  { id: 'kjv', name: 'King James Version', abbreviation: 'KJV' },
  { id: 'niv', name: 'New International Version', abbreviation: 'NIV' },
  { id: 'esv', name: 'English Standard Version', abbreviation: 'ESV' },
  { id: 'nlt', name: 'New Living Translation', abbreviation: 'NLT' },
  { id: 'nasb', name: 'New American Standard Bible', abbreviation: 'NASB' }
];

export const sampleVerses: Record<string, Record<string, string>> = {
  'John 3:16': {
    kjv: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.',
    niv: 'For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life.',
    esv: 'For God so loved the world, that he gave his only Son, that whoever believes in him should not perish but have eternal life.',
    nlt: 'For this is how God loved the world: He gave his one and only Son, so that everyone who believes in him will not perish but have eternal life.',
    nasb: 'For God so loved the world, that He gave His only Son, so that everyone who believes in Him will not perish, but have eternal life.'
  },
  'Psalm 23:1': {
    kjv: 'The LORD is my shepherd; I shall not want.',
    niv: 'The LORD is my shepherd, I lack nothing.',
    esv: 'The LORD is my shepherd; I shall not want.',
    nlt: 'The LORD is my shepherd; I have all that I need.',
    nasb: 'The LORD is my shepherd, I will not be in need.'
  },
  'Jeremiah 29:11': {
    kjv: 'For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.',
    niv: 'For I know the plans I have for you, declares the LORD, plans to prosper you and not to harm you, plans to give you hope and a future.',
    esv: 'For I know the plans I have for you, declares the LORD, plans for welfare and not for evil, to give you a future and a hope.',
    nlt: 'For I know the plans I have for you, says the LORD. They are plans for good and not for disaster, to give you a future and a hope.',
    nasb: 'For I know the plans that I have for you, declares the LORD, plans for prosperity and not for disaster, to give you a future and a hope.'
  },
  'Philippians 4:13': {
    kjv: 'I can do all things through Christ which strengtheneth me.',
    niv: 'I can do all this through him who gives me strength.',
    esv: 'I can do all things through him who strengthens me.',
    nlt: 'For I can do everything through Christ, who gives me strength.',
    nasb: 'I can do all things through Him who strengthens me.'
  },
  'Romans 8:28': {
    kjv: 'And we know that all things work together for good to them that love God, to them who are the called according to his purpose.',
    niv: 'And we know that in all things God works for the good of those who love him, who have been called according to his purpose.',
    esv: 'And we know that for those who love God all things work together for good, for those who are called according to his purpose.',
    nlt: 'And we know that God causes everything to work together for the good of those who love God and are called according to his purpose for them.',
    nasb: 'And we know that God causes all things to work together for good to those who love God, to those who are called according to His purpose.'
  },
  'Proverbs 3:5-6': {
    kjv: 'Trust in the LORD with all thine heart; and lean not unto thine own understanding. In all thy ways acknowledge him, and he shall direct thy paths.',
    niv: 'Trust in the LORD with all your heart and lean not on your own understanding; in all your ways submit to him, and he will make your paths straight.',
    esv: 'Trust in the LORD with all your heart, and do not lean on your own understanding. In all your ways acknowledge him, and he will make straight your paths.',
    nlt: 'Trust in the LORD with all your heart; do not depend on your own understanding. Seek his will in all you do, and he will show you which path to take.',
    nasb: 'Trust in the LORD with all your heart and do not lean on your own understanding. In all your ways acknowledge Him, and He will make your paths straight.'
  },
  'Isaiah 40:31': {
    kjv: 'But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint.',
    niv: 'But those who hope in the LORD will renew their strength. They will soar on wings like eagles; they will run and not grow weary, they will walk and not be faint.',
    esv: 'But they who wait for the LORD shall renew their strength; they shall mount up with wings like eagles; they shall run and not be weary; they shall walk and not faint.',
    nlt: 'But those who trust in the LORD will find new strength. They will soar high on wings like eagles. They will run and not grow weary. They will walk and not faint.',
    nasb: 'Yet those who wait for the LORD will gain new strength; they will mount up with wings like eagles, they will run and not get tired, they will walk and not become weary.'
  },
  'Matthew 11:28': {
    kjv: 'Come unto me, all ye that labour and are heavy laden, and I will give you rest.',
    niv: 'Come to me, all you who are weary and burdened, and I will give you rest.',
    esv: 'Come to me, all who labor and are heavy laden, and I will give you rest.',
    nlt: 'Then Jesus said, Come to me, all of you who are weary and carry heavy burdens, and I will give you rest.',
    nasb: 'Come to Me, all who are weary and burdened, and I will give you rest.'
  },
  'Psalm 46:10': {
    kjv: 'Be still, and know that I am God: I will be exalted among the heathen, I will be exalted in the earth.',
    niv: 'He says, Be still, and know that I am God; I will be exalted among the nations, I will be exalted in the earth.',
    esv: 'Be still, and know that I am God. I will be exalted among the nations, I will be exalted in the earth!',
    nlt: 'Be still, and know that I am God! I will be honored by every nation. I will be honored throughout the world.',
    nasb: 'Stop striving and know that I am God; I will be exalted among the nations, I will be exalted on the earth.'
  },
  'Joshua 1:9': {
    kjv: 'Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.',
    niv: 'Have I not commanded you? Be strong and courageous. Do not be afraid; do not be discouraged, for the LORD your God will be with you wherever you go.',
    esv: 'Have I not commanded you? Be strong and courageous. Do not be frightened, and do not be dismayed, for the LORD your God is with you wherever you go.',
    nlt: 'This is my command be strong and courageous! Do not be afraid or discouraged. For the LORD your God is with you wherever you go.',
    nasb: 'Have I not commanded you? Be strong and courageous! Do not be terrified nor dismayed, for the LORD your God is with you wherever you go.'
  },
  'Hebrews 11:1': {
    kjv: 'Now faith is the substance of things hoped for, the evidence of things not seen.',
    niv: 'Now faith is confidence in what we hope for and assurance about what we do not see.',
    esv: 'Now faith is the assurance of things hoped for, the conviction of things not seen.',
    nlt: 'Faith shows the reality of what we hope for; it is the evidence of things we cannot see.',
    nasb: 'Now faith is the certainty of things hoped for, a proof of things not seen.'
  },
  '2 Corinthians 12:9': {
    kjv: 'And he said unto me, My grace is sufficient for thee: for my strength is made perfect in weakness.',
    niv: 'But he said to me, My grace is sufficient for you, for my power is made perfect in weakness.',
    esv: 'But he said to me, My grace is sufficient for you, for my power is made perfect in weakness.',
    nlt: 'Each time he said, My grace is all you need. My power works best in weakness.',
    nasb: 'And He has said to me, My grace is sufficient for you, for power is perfected in weakness.'
  },
  'Philippians 4:7': {
    kjv: 'And the peace of God, which passeth all understanding, shall keep your hearts and minds through Christ Jesus.',
    niv: 'And the peace of God, which transcends all understanding, will guard your hearts and your minds in Christ Jesus.',
    esv: 'And the peace of God, which surpasses all understanding, will guard your hearts and your minds in Christ Jesus.',
    nlt: 'Then you will experience God\'s peace, which exceeds anything we can understand. His peace will guard your hearts and minds as you live in Christ Jesus.',
    nasb: 'And the peace of God, which surpasses all comprehension, will guard your hearts and minds in Christ Jesus.'
  },
  '1 Corinthians 13:8': {
    kjv: 'Charity never faileth: but whether there be prophecies, they shall fail; whether there be tongues, they shall cease; whether there be knowledge, it shall vanish away.',
    niv: 'Love never fails. But where there are prophecies, they will cease; where there are tongues, they will be stilled; where there is knowledge, it will pass away.',
    esv: 'Love never ends. As for prophecies, they will pass away; as for tongues, they will cease; as for knowledge, it will pass away.',
    nlt: 'Prophecy and speaking in unknown languages and special knowledge will become useless. But love will last forever!',
    nasb: 'Love never fails; but if there are gifts of prophecy, they will be done away with; if there are tongues, they will cease; if there is knowledge, it will be done away with.'
  },
  'Psalm 30:5': {
    kjv: 'For his anger endureth but a moment; in his favour is life: weeping may endure for a night, but joy cometh in the morning.',
    niv: 'For his anger lasts only a moment, but his favor lasts a lifetime; weeping may stay for the night, but rejoicing comes in the morning.',
    esv: 'For his anger is but for a moment, and his favor is for a lifetime. Weeping may tarry for the night, but joy comes with the morning.',
    nlt: 'For his anger lasts only a moment, but his favor lasts a lifetime! Weeping may last through the night, but joy comes with the morning.',
    nasb: 'For His anger is but for a moment, His favor is for a lifetime; Weeping may last for the night, But a shout of joy comes in the morning.'
  },
  'Ephesians 4:32': {
    kjv: 'And be ye kind one to another, tenderhearted, forgiving one another, even as God for Christ\'s sake hath forgiven you.',
    niv: 'Be kind and compassionate to one another, forgiving each other, just as in Christ God forgave you.',
    esv: 'Be kind to one another, tenderhearted, forgiving one another, as God in Christ forgave you.',
    nlt: 'Instead, be kind to each other, tenderhearted, forgiving one another, just as God through Christ has forgiven you.',
    nasb: 'Be kind to one another, compassionate, forgiving each other, just as God in Christ also has forgiven you.'
  },
  'Hebrews 6:19': {
    kjv: 'Which hope we have as an anchor of the soul, both sure and stedfast, and which entereth into that within the veil.',
    niv: 'We have this hope as an anchor for the soul, firm and secure. It enters the inner sanctuary behind the curtain.',
    esv: 'We have this as a sure and steadfast anchor of the soul, a hope that enters into the inner place behind the curtain.',
    nlt: 'This hope is a strong and trustworthy anchor for our souls. It leads us through the curtain into God\'s inner sanctuary.',
    nasb: 'This hope we have as an anchor of the soul, a hope both sure and reliable and one which enters within the veil.'
  },
  'James 3:17': {
    kjv: 'But the wisdom that is from above is first pure, then peaceable, gentle, and easy to be intreated, full of mercy and good fruits, without partiality, and without hypocrisy.',
    niv: 'But the wisdom that comes from heaven is first of all pure; then peace-loving, considerate, submissive, full of mercy and good fruit, impartial and sincere.',
    esv: 'But the wisdom from above is first pure, then peaceable, gentle, open to reason, full of mercy and good fruits, impartial and sincere.',
    nlt: 'But the wisdom from above is first of all pure. It is also peace loving, gentle at all times, and willing to yield to others. It is full of mercy and the fruit of good deeds. It shows no favoritism and is always sincere.',
    nasb: 'But the wisdom from above is first pure, then peace-loving, gentle, reasonable, full of mercy and good fruits, impartial, free of hypocrisy.'
  }
};

// Cache for fetched verses to avoid repeated API calls
const verseCache: Record<string, Record<string, string>> = { ...sampleVerses };

/**
 * Fetch verse text from Bible API
 * Using bible-api.com which is free and doesn't require authentication
 */
const fetchVerseFromAPI = async (reference: string, version: string): Promise<string> => {
  try {
    // Normalize the reference format for the API
    const normalizedRef = reference.trim();
    
    // bible-api.com uses format like "john 3:16" (lowercase, no special chars)
    const apiRef = normalizedRef.toLowerCase().replace(/\s+/g, '+');
    
    // Map our version codes to API version codes (bible-api.com primarily uses KJV)
    // For other versions, we'll need to use a different API or fallback
    const apiUrl = `https://bible-api.com/${apiRef}`;
    
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      throw new Error('Failed to fetch verse');
    }
    
    const data = await response.json();
    
    // Extract the verse text and clean it up
    let verseText = data.text?.trim() || '';
    
    // Remove the reference prefix if it exists (e.g., "John 3:16 - ")
    verseText = verseText.replace(/^[^-]+-\s*/, '').trim();
    
    return verseText || 'Verse text not available';
  } catch (error) {
    console.error('Error fetching verse from API:', error);
    return 'Verse text not available';
  }
};

/**
 * Get verse text with caching and API fallback
 */
export const getVerseText = async (reference: string, version: string = 'niv'): Promise<string> => {
  const lowerVersion = version.toLowerCase();
  
  // Check cache first
  if (verseCache[reference]?.[lowerVersion]) {
    return verseCache[reference][lowerVersion];
  }
  
  // If not in cache, try to fetch from API
  const verseText = await fetchVerseFromAPI(reference, lowerVersion);
  
  // Cache the result
  if (!verseCache[reference]) {
    verseCache[reference] = {};
  }
  verseCache[reference][lowerVersion] = verseText;
  
  return verseText;
};

/**
 * Synchronous version that returns cached or sample verses only
 * Use this when you can't await (for immediate display)
 */
export const getVerseTextSync = (reference: string, version: string = 'niv'): string => {
  const lowerVersion = version.toLowerCase();
  const verse = verseCache[reference] || sampleVerses[reference];
  
  if (verse) {
    return verse[lowerVersion] || verse['niv'] || verse['kjv'] || 'Loading verse...';
  }
  
  return 'Loading verse...';
};

export const getAllVersionsForVerse = (reference: string): Record<string, string> | null => {
  return sampleVerses[reference] || null;
};