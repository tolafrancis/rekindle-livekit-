-- supabase/migrations/0020_seed_book_summaries.sql
-- Populate the Books feature (book_summaries) with the starter library.
-- Idempotent: only inserts a book when one with the same title + author is
-- not already present, so it is safe to re-run.

insert into public.book_summaries
  (id, title, author, category, summary, key_takeaways, cover_image_url, audio_url, pdf_url, is_published)
select
  gen_random_uuid(),
  v.title, v.author, v.category, v.summary, v.key_takeaways, '', v.audio_url, '', true
from (values
  (
    'The Purpose Driven Life', 'Rick Warren', 'Christian Living',
    'A groundbreaking manifesto on the meaning of life. Rick Warren guides readers through a 40-day spiritual journey to discover their God-given purpose. This book has transformed millions of lives worldwide by answering life''s most fundamental question: "What on earth am I here for?" Warren presents five purposes that God has for every person, helping readers understand that life is not about them but about living for God''s purposes.',
    array['You were planned for God''s pleasure','You were formed for God''s family','You were created to become like Christ','You were shaped for serving God','You were made for a mission']::text[],
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'
  ),
  (
    'Mere Christianity', 'C.S. Lewis', 'Apologetics',
    'A rational defense of the Christian faith. Lewis presents the core beliefs that unite Christians across denominations. Originally delivered as BBC radio talks during World War II, this book remains one of the most popular and influential works of Christian apologetics ever written. Lewis uses logic, wit, and profound insight to explain and defend the beliefs that are common to nearly all Christians.',
    array['The Moral Law points to God','Christianity explains human nature','Faith and reason work together','Christian virtues transform character','The choice between good and evil is real']::text[],
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3'
  ),
  (
    'The Power of a Praying Life', 'Stormie Omartian', 'Prayer',
    'Transform your prayer life with practical guidance on developing a deeper, more powerful connection with God. Stormie Omartian shares her personal journey and provides biblical foundations for effective prayer. This book teaches readers how to pray with confidence, knowing that God hears and answers prayers according to His perfect will.',
    array['Prayer changes everything','Consistency builds spiritual strength','Pray with Scripture','Intercession for others transforms lives','Praise opens doors to God''s presence']::text[],
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3'
  ),
  (
    'Boundaries', 'Dr. Henry Cloud', 'Christian Living',
    'Learn when to say yes and how to say no to take control of your life while honoring God and others. Dr. Cloud provides biblical wisdom for establishing healthy boundaries in all relationships. This book helps readers understand that boundaries are not walls but fences with gates - they define who you are and what you are responsible for.',
    array['Healthy boundaries honor God','Saying no is not selfish','Boundaries protect relationships','Personal responsibility matters','Love requires limits']::text[],
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3'
  ),
  (
    'Knowing God', 'J.I. Packer', 'Theology',
    'A classic exploration of who God is and how we can know Him personally through Scripture and relationship. Packer distinguishes between knowing about God and actually knowing God, leading readers into a deeper, more intimate relationship with their Creator. This book has been called one of the most important Christian books of the 20th century.',
    array['God desires relationship with us','Knowing about God vs knowing God','God''s attributes reveal His character','Adoption into God''s family','God''s guidance is personal and real']::text[],
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3'
  ),
  (
    'Radical', 'David Platt', 'Discipleship',
    'A call to return to the radical demands of following Jesus and abandoning the American Dream for the gospel. Platt challenges readers to consider what they would give up for Christ and presents a compelling vision for authentic discipleship that mirrors the early church''s commitment to Jesus.',
    array['Jesus demands everything','Comfortable Christianity is not biblical','Global mission is every believer''s call','Sacrifice leads to true joy','The gospel is worth dying for']::text[],
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3'
  ),
  (
    'Celebration of Discipline', 'Richard Foster', 'Spiritual Growth',
    'A comprehensive guide to the classical spiritual disciplines that lead to inner transformation. Foster explores inward disciplines (meditation, prayer, fasting, study), outward disciplines (simplicity, solitude, submission, service), and corporate disciplines (confession, worship, guidance, celebration).',
    array['Disciplines are pathways to grace','Meditation deepens faith','Simplicity frees the soul','Community strengthens growth','Celebration is a discipline']::text[],
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3'
  ),
  (
    'The Screwtape Letters', 'C.S. Lewis', 'Fiction',
    'A satirical masterpiece revealing spiritual warfare through letters from a senior demon to his nephew. Lewis brilliantly exposes the subtle tactics of temptation and the nature of spiritual battle, all while providing profound insights into human nature and the Christian life.',
    array['Spiritual warfare is real','Small compromises lead to destruction','Pleasure is God''s invention','Pride is the ultimate sin','Distraction is a powerful weapon']::text[],
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3'
  )
) as v(title, author, category, summary, key_takeaways, audio_url)
where not exists (
  select 1 from public.book_summaries b
  where b.title = v.title and b.author = v.author
);
