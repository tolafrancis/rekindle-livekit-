// Public, crawlable URLs for prayer topics: /prayers/<id>/<slug>. The id finds
// the topic, the slug is only there to make the URL readable, so renaming a
// topic never breaks old links.
export const slugify = (title: string) =>
  (title || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'prayer';

export const prayerTopicPath = (topic: { id: string; title: string }) =>
  `/prayers/${topic.id}/${slugify(topic.title)}`;
