// Captures the screenshots used by the step-by-step tutorial page
// (packages/features/src/components/RekindleTutorialPage.tsx) and writes
// them into both apps' public/tutorial/ folders.
//
// Usage (from the repo root, with a demo account that leads a demo ministry):
//   npx playwright@latest --version            # first run only, fetches Playwright
//   TUTORIAL_EMAIL=demo@example.com TUTORIAL_PASSWORD=... \
//   TUTORIAL_BASE_URL=https://app.rekindlebc.com \
//   node scripts/capture-tutorial-screenshots.mjs
//
// Use a demo account and demo ministry: every screenshot is published on the
// public /tutorial page, so real members' names must not appear in them.
// Any screen that can't be reached is skipped and listed at the end; the
// tutorial simply hides a screenshot whose file doesn't exist.

import { chromium } from 'playwright';
import { mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';

const BASE = (process.env.TUTORIAL_BASE_URL || 'https://app.rekindlebc.com').replace(/\/$/, '');
const EMAIL = process.env.TUTORIAL_EMAIL;
const PASSWORD = process.env.TUTORIAL_PASSWORD;
const OUT_DIRS = ['apps/rekindle/public/tutorial', 'apps/ministry/public/tutorial'];

if (!EMAIL || !PASSWORD) {
  console.error('Set TUTORIAL_EMAIL and TUTORIAL_PASSWORD (a demo account).');
  process.exit(1);
}
OUT_DIRS.forEach(d => mkdirSync(d, { recursive: true }));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const skipped = [];

const save = async (file) => {
  await page.waitForTimeout(2000);
  const first = path.join(OUT_DIRS[0], file);
  await page.screenshot({ path: first });
  OUT_DIRS.slice(1).forEach(d => copyFileSync(first, path.join(d, file)));
  console.log('saved', file);
};

const tapText = async (text, exact = true) => {
  await page.getByText(text, { exact }).first().click({ timeout: 8000 });
  await page.waitForTimeout(1200);
};

// Each shot: a file name and the steps to reach it from a fresh page load.
const shot = async (file, reach) => {
  try {
    await reach();
    await save(file);
  } catch (err) {
    skipped.push(`${file}: ${err.message.split('\n')[0]}`);
  }
};

const open = (p) => page.goto(`${BASE}${p}`, { waitUntil: 'networkidle' });

// Signed out
await shot('landing.png', () => open('/'));
await shot('sign-up.png', async () => { await open('/'); await tapText('Get Started Free', false); });
await shot('sign-in.png', async () => { await open('/'); await tapText('I already have an account'); });

// Sign in
await open('/');
await tapText('I already have an account');
await page.getByPlaceholder(/email/i).first().fill(EMAIL);
await page.locator('input[type="password"]').first().fill(PASSWORD);
await page.getByRole('button', { name: 'Sign In', exact: true }).click();
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);

// Members (the consumer app routes each main tab by URL)
await shot('home.png', () => open('/'));
await shot('devotionals.png', () => open('/devotional-library'));
await shot('prayer-wall.png', () => open('/wall'));
await shot('journal.png', () => open('/journal'));
await shot('live-discover.png', () => open('/live-channels'));
await shot('ministries.png', () => open('/ministries'));
await shot('notifications.png', async () => { await open('/profile'); await page.getByText('Notifications').first().scrollIntoViewIfNeeded(); });
await shot('billing.png', () => open('/billing'));

// Leaders: open the first ministry this account manages, then walk its menu.
const manage = async (...labels) => {
  await open('/ministries');
  await tapText('Manage');
  for (const l of labels) await tapText(l);
};
await shot('people.png', () => manage('Settings', 'People'));
await shot('registration.png', async () => { await manage('Settings', 'General'); await page.getByText('Member Registration').first().scrollIntoViewIfNeeded(); });
await shot('devotional-creator.png', () => manage('Settings', 'Content'));
await shot('live-channel.png', () => manage('Live', 'Live Channel'));
await shot('meetings.png', () => manage('Ministry', 'Meetings'));
await shot('webinar-new.png', async () => { await manage('Live', 'Webinars'); await tapText('New webinar'); });
await shot('small-group-create.png', async () => { await manage('Small Groups'); await tapText('Create Group'); });
await shot('video-message.png', async () => { await manage('Settings', 'Content'); await tapText('New Video Message'); });
await shot('translation-service.png', () => manage('Live', 'Live Translation'));
await shot('translation-start.png', async () => { await manage('Live', 'Live Translation'); await tapText('Start Service'); });
await shot('finance.png', () => manage('Settings', 'Finance & Billing'));

await browser.close();

if (skipped.length) {
  console.log('\nSkipped (capture these by hand, same file names):');
  skipped.forEach(s => console.log(' -', s));
}
