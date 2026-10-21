import { slugify } from './prayerTopicLinks';

// Only Rekindle's own stream gets public pages. Other streams (Open Heavens)
// are published by other ministries and stay inside the app.
export const REKINDLE_DEVOTIONAL_STREAM_ID = '81ab9262-e7e8-4975-840d-1b8d09bd4c84';

// /devotionals/<id>/<slug>: the id finds the devotional, the slug is cosmetic.
export const devotionalPath = (d: { id: number | string; title: string | null }) =>
  `/devotionals/${d.id}/${slugify(d.title || 'devotional')}`;
