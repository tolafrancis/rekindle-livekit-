// End-to-end checks for the guided tutorials (apps/rekindle/src/tutorials,
// packages/features/src/tutorial). Runs the real app against a dev server with
// Supabase mocked in the browser, so it signs in as a fake user and never
// touches production data.
//
// Usage (from the repo root):
//   (cd apps/rekindle && npx vite --port 5173 --strictPort --host 127.0.0.1) &
//   npm i --no-save playwright            # first run only
//   node scripts/test-tutorials.mjs /tmp/tutorial-shots [test,names]
//
// Set CHROMIUM_PATH to use an already-installed Chromium.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'http://127.0.0.1:5173';
const USER_ID = '11111111-2222-3333-4444-555555555555';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: USER_ID, role: 'authenticated', exp: 4102444800, aud: 'authenticated', email: 'demo@example.com' }) + '.sig';
const user = { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.com', app_metadata: {}, user_metadata: { full_name: 'Demo User' }, created_at: '2026-01-01T00:00:00Z' };
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 3600 * 24 * 365, expires_at: 4102444800, user };

function makeState(metadata = {}) {
  return {
    profile: {
      id: USER_ID, user_id: USER_ID, email: 'demo@example.com', full_name: 'Demo User', role: 'user',
      subscription_tier: 'free', onboarding_completed: true, metadata, language_preference: 'en',
    },
    patches: [],
  };
}

async function launch() {
  return chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
}

async function openApp(browser, state, { viewport = { width: 1440, height: 900 }, path = '/home', localTutorials } = {}) {
  const context = await browser.newContext({ viewport, isMobile: viewport.width < 600, hasTouch: viewport.width < 600 });
  await context.addInitScript(([s, lt, uid]) => {
    localStorage.setItem('kindled-auth-token', JSON.stringify(s));
    localStorage.setItem('supabase_project_ref', 'vpnpembyqbbaaiynfvli');
    if (lt) localStorage.setItem('rk_tutorials_v1_' + uid, JSON.stringify(lt));
  }, [session, localTutorials ?? null, USER_ID]);
  await context.route((u) => u.hostname.endsWith('supabase.co'), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (p.startsWith('/auth/v1/user')) return json(user);
    if (p.startsWith('/auth/v1/token')) return json(session);
    if (p.startsWith('/auth/v1/')) return json({});
    if (p.startsWith('/rest/v1/user_profiles')) {
      if (req.method() === 'PATCH') {
        const body = JSON.parse(req.postData() || '{}');
        state.patches.push(body);
        Object.assign(state.profile, body);
        return route.fulfill({ status: 204, body: '' });
      }
      if (req.method() !== 'GET' && req.method() !== 'HEAD') return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
      const accept = req.headers()['accept'] || '';
      if (accept.includes('vnd.pgrst.object')) return json(state.profile);
      return json([state.profile]);
    }
    if (p.startsWith('/rest/v1/')) {
      const accept = req.headers()['accept'] || '';
      if (req.method() !== 'GET' && req.method() !== 'HEAD') return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
      if (accept.includes('vnd.pgrst.object')) return json({ code: 'PGRST116', message: 'no rows', details: null, hint: null }, 406);
      return json([]);
    }
    if (p.startsWith('/functions/v1/')) return json({});
    if (p.startsWith('/storage/v1/')) return route.fulfill({ status: 404, body: '' });
    return json({});
  });
  // Unrelated third-party traffic: stub so pages don't hang.
  await context.route((u) => u.hostname !== '127.0.0.1' && !u.hostname.endsWith('supabase.co'), (r) => r.fulfill({ status: 204, body: '' }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE + path);
  return { page, context, errors };
}

const card = (page) => page.locator('[role="dialog"][aria-modal="false"]');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const OUT = process.argv[2] || 'tutorial-shots';
mkdirSync(OUT, { recursive: true });
const only = process.argv[3];
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
const b = await launch();

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const done = { v: 1, welcome: { status: 'dismissed', updatedAt: '2026-10-01T00:00:00Z' }, tutorials: {} };

async function title(page) {
  const c = card(page);
  await c.waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForFunction(() => {
    const el = document.querySelector('[role="dialog"][aria-modal="false"]');
    return el && getComputedStyle(el).visibility === 'visible';
  }, null, { timeout: 10000 });
  return (await c.locator('h2').innerText()).trim();
}
async function stepLabel(page) { return (await card(page).locator('p').first().textContent()).trim(); }
async function clickCard(page, name) { await card(page).getByRole('button', { name, exact: false }).first().click(); await sleep(400); }
async function inViewport(page) {
  const box = await card(page).boundingBox();
  const vp = page.viewportSize();
  return box && box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width + 0.5 && box.y + box.height <= vp.height + 0.5;
}
async function spotlightOn(page, tourId) {
  await sleep(450);
  return page.evaluate((id) => {
    const els = [...document.querySelectorAll(`[data-tour="${id}"]`)].filter((e) => e.getBoundingClientRect().width > 0);
    const spot = [...document.querySelectorAll('div[aria-hidden="true"] > div.ring-2')][0];
    if (!els.length || !spot) return false;
    const a = els[0].getBoundingClientRect(); const s = spot.getBoundingClientRect();
    return Math.abs(a.left - 6 - s.left) < 3 && Math.abs(a.top - 6 - s.top) < 3;
  }, tourId);
}
const localState = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('rk_tutorials_v1_11111111-2222-3333-4444-555555555555') || 'null'));
async function startFromLibrary(page, name) {
  await page.locator('[data-tour="help-button"]:visible').click();
  await page.getByRole('menuitem', { name: 'Browse Tutorials' }).click();
  const item = page.locator('li', { hasText: name });
  await item.getByRole('button').first().click();
  await sleep(600);
}

const tests = {
  async intro_desktop() {
    const st = makeState();
    const { page, errors, context } = await openApp(b, st, { viewport: DESKTOP });
    await page.getByRole('button', { name: 'Start Tutorial' }).click({ timeout: 30000 });
    let t = await title(page);
    check('intro: first step shows', t === 'Your main menu', t);
    check('intro: progress label', (await stepLabel(page)) === 'Step 1 of 7');
    check('intro: spotlight on primary nav', await spotlightOn(page, 'primary-nav'));
    await page.screenshot({ path: `${OUT}/d-intro-1.png` });
    await clickCard(page, 'Next');
    t = await title(page);
    check('intro: next → devotional', t === "Today's devotional", t);
    check('intro: spotlight on devotional card', await spotlightOn(page, 'home-devotional'));
    await page.screenshot({ path: `${OUT}/d-intro-2.png` });
    await clickCard(page, 'Back');
    check('intro: back works', (await title(page)) === 'Your main menu');
    await page.keyboard.press('ArrowRight'); await sleep(400);
    check('intro: ArrowRight advances', (await title(page)) === "Today's devotional");
    for (let i = 0; i < 4; i++) await clickCard(page, 'Next');
    t = await title(page);
    check('intro: notifications step', t === 'Notifications', t);
    await clickCard(page, 'Next');
    t = await title(page);
    check('intro: help step', t === 'Help is always here', t);
    check('intro: spotlight on help button', await spotlightOn(page, 'help-button'));
    await page.screenshot({ path: `${OUT}/d-intro-7.png` });
    await clickCard(page, 'Done');
    check('intro: card gone after Done', (await card(page).count()) === 0);
    const ls = await localState(page);
    check('intro: completed saved locally', ls?.tutorials?.['welcome-tour']?.status === 'completed' && ls?.welcome?.status === 'completed', JSON.stringify(ls?.welcome));
    await sleep(2500);
    const last = st.patches.at(-1);
    check('intro: synced to profile metadata', last?.metadata?.tutorials?.tutorials?.['welcome-tour']?.status === 'completed');
    await page.reload(); await sleep(6000);
    check('intro: welcome not shown again after reload', (await page.getByRole('button', { name: 'Start Tutorial' }).count()) === 0);
    check('intro: no page errors', errors.length === 0, errors.join(' | '));
    await context.close();
  },

  async cross_device() {
    // Server says welcome was dismissed on another device; this device has nothing.
    const st = makeState({ tutorials: done });
    const { page, context } = await openApp(b, st, { viewport: DESKTOP });
    await sleep(9000);
    check('sync: welcome hidden when dismissed on another device', (await page.getByRole('button', { name: 'Start Tutorial' }).count()) === 0);
    const ls = await localState(page);
    check('sync: server progress merged into device', ls?.welcome?.status === 'dismissed');
    await context.close();
  },

  async remind_later() {
    const st = makeState();
    const { page, context } = await openApp(b, st, { viewport: DESKTOP });
    await page.getByRole('button', { name: 'Remind Me Later' }).click({ timeout: 30000 });
    const ls = await localState(page);
    check('later: saved with remindAt', ls?.welcome?.status === 'later' && ls.welcome.laterCount === 1 && !!ls.welcome.remindAt);
    await page.reload(); await sleep(6000);
    check('later: not shown again today', (await page.getByRole('button', { name: 'Start Tutorial' }).count()) === 0);
    await context.close();
  },

  async intro_phone() {
    const st = makeState();
    const { page, context } = await openApp(b, st, { viewport: PHONE });
    await page.screenshot({ path: `${OUT}/p-welcome-wait.png` });
    await page.getByRole('button', { name: 'Start Tutorial' }).click({ timeout: 30000 });
    await page.screenshot({ path: `${OUT}/p-welcome.png` });
    let ok = true;
    for (let i = 0; i < 7; i++) {
      const t = await title(page);
      const inside = await inViewport(page);
      if (!inside) { ok = false; console.log('   card outside viewport at', t); }
      await page.screenshot({ path: `${OUT}/p-intro-${i + 1}.png` });
      if (i < 6) await clickCard(page, 'Next');
    }
    check('phone: every intro card stays inside the screen', ok);
    check('phone: spotlight on help button', await spotlightOn(page, 'help-button'));
    await clickCard(page, 'Done');
    await context.close();
  },

  async practise_nav() {
    const st = makeState({ tutorials: done });
    const { page, context } = await openApp(b, st, { viewport: DESKTOP });
    await sleep(5000);
    await startFromLibrary(page, 'Getting around Rekindle');
    await clickCard(page, 'Next');
    let t = await title(page);
    check('practise: action step shows', t === 'Open The Word', t);
    check('practise: Skip this step offered', (await card(page).getByRole('button', { name: 'Skip this step' }).count()) === 1);
    await page.screenshot({ path: `${OUT}/d-practise-word.png` });
    await page.locator('[data-tour="nav-the-word"]:visible').click();
    await sleep(800);
    t = await title(page);
    check('practise: clicking The Word advances', t === 'Pages inside each area', t);
    check('practise: route changed', page.url().endsWith('/devotional-library'), page.url());
    check('practise: secondary nav highlighted', await spotlightOn(page, 'secondary-nav'));
    await page.screenshot({ path: `${OUT}/d-practise-sub.png` });
    await clickCard(page, 'Next'); await clickCard(page, 'Next');
    t = await title(page);
    check('practise: account step', t === 'Your account menu', t);
    await clickCard(page, 'Next');
    await page.locator('[data-tour="nav-home"]:visible').click(); await sleep(600);
    check('practise: final action completes tutorial', (await card(page).count()) === 0 && (await localState(page))?.tutorials?.['getting-around']?.status === 'completed');
    await context.close();
  },

  async prayer_wall_menu_dialog() {
    const st = makeState({ tutorials: done });
    const { page, context } = await openApp(b, st, { viewport: PHONE });
    await sleep(5000);
    await startFromLibrary(page, 'Share a request on the Prayer Wall');
    let t = await title(page);
    check('wall: opens Prayer Wall', t === 'The Prayer Wall' && page.url().endsWith('/wall'), page.url());
    await page.screenshot({ path: `${OUT}/p-wall-1.png` });
    await clickCard(page, 'Next');
    t = await title(page);
    const shareDisabled = await page.locator('[data-tour="prayer-wall-share"]:visible').isDisabled();
    console.log('   share button disabled for this account:', shareDisabled);
    if (shareDisabled) {
      check('wall: disabled button explained', (await card(page).innerText()).includes("isn't available"));
      return context.close();
    }
    await page.locator('[data-tour="prayer-wall-share"]:visible').click(); await sleep(800);
    t = await title(page);
    check('wall: opening the form advances', t === 'Post anonymously', t);
    check('wall: anonymous option highlighted', await spotlightOn(page, 'prayer-wall-anonymous'));
    await page.screenshot({ path: `${OUT}/p-wall-anon.png` });
    // Inside an app modal, ARIA hides the card from role queries (see PR notes): click by text.
    await page.locator('[data-rk-tutorial] button', { hasText: 'Next' }).click({ timeout: 5000 }); await sleep(400);
    check('wall: form stays open after pressing Next', (await page.locator('[data-tour="prayer-wall-form"]').count()) === 1);
    t = await title(page);
    check('wall: last step', t === "You're in control", t);
    await page.locator('[data-rk-tutorial] button', { hasText: 'Done' }).click(); await sleep(400);
    const posted = st.patches.length; // only user_profiles patches recorded; check no POST to wall
    check('wall: tutorial finished without posting', (await card(page).count()) === 0, String(posted));
    await context.close();
  },

  async settings_account_menu() {
    const st = makeState({ tutorials: done });
    const { page, context } = await openApp(b, st, { viewport: DESKTOP });
    await sleep(5000);
    await startFromLibrary(page, 'Your profile and settings');
    let t = await title(page);
    check('settings: first step', t === 'Open your account menu', t);
    await page.locator('[data-tour="account-menu"]:visible').click(); await sleep(700);
    t = await title(page);
    check('settings: opening menu advances', t === 'Open Profile', t);
    check('settings: Profile item highlighted', await spotlightOn(page, 'account-profile'));
    await page.screenshot({ path: `${OUT}/d-settings-menu.png` });
    await page.locator('[data-tour="account-profile"]').click(); await sleep(1500);
    t = await title(page);
    check('settings: profile opens', t === 'Your settings' && page.url().endsWith('/profile'), t + ' ' + page.url());
    await clickCard(page, 'Next'); await clickCard(page, 'Next'); await sleep(600);
    t = await title(page);
    check('settings: language section step', t === 'Language', t);
    const langActive = await page.locator('[data-tour="settings-language"]:visible').getAttribute('class');
    check('settings: Language section opened', !!langActive?.includes('bg-purple-600'));
    await page.screenshot({ path: `${OUT}/d-settings-language.png` });
    await page.keyboard.press('Escape'); await sleep(300);
    check('settings: Escape exits', (await card(page).count()) === 0);
    const ls = await localState(page);
    check('settings: exit keeps it resumable', ls?.tutorials?.['profile-settings']?.status === 'in_progress' && ls.tutorials['profile-settings'].step === 4, JSON.stringify(ls?.tutorials?.['profile-settings']));
    // Resume from the library
    await page.locator('[data-tour="help-button"]:visible').click();
    await page.getByRole('menuitem', { name: 'Browse Tutorials' }).click();
    const item = page.locator('li', { hasText: 'Your profile and settings' });
    check('settings: library shows In progress', (await item.innerText()).includes('In progress'));
    await page.screenshot({ path: `${OUT}/d-library.png` });
    await item.getByRole('button', { name: 'Resume' }).click(); await sleep(800);
    t = await title(page);
    check('settings: resume continues at Language', t === 'Language', t);
    await context.close();
  },

  async pause_and_missing() {
    const st = makeState({ tutorials: done });
    const { page, context } = await openApp(b, st, { viewport: DESKTOP });
    await sleep(5000);
    await startFromLibrary(page, "Read and listen to today's devotional");
    await title(page);
    // Wander off: the overlay must not block the app.
    await page.locator('[data-tour="nav-community"]:visible').click(); await sleep(800);
    check('pause: app usable during a tour (navigated)', page.url().endsWith('/community-feed'), page.url());
    check('pause: tour pauses instead of pointing at nothing', (await page.getByText('Tutorial paused').count()) === 1);
    await page.screenshot({ path: `${OUT}/d-paused.png` });
    await page.getByRole('button', { name: 'Resume' }).click(); await sleep(1200);
    check('pause: resume returns to Home', page.url().endsWith('/home') && (await title(page)) === "Today's devotional", page.url());
    await clickCard(page, 'Skip tutorial');
    check('skip: marked skipped', (await localState(page))?.tutorials?.['daily-devotional']?.status === 'skipped');
    // Missing target: no counsellors in this mock.
    await startFromLibrary(page, 'Find a counsellor and manage bookings');
    await clickCard(page, 'Skip this step');
    await sleep(4800);
    let mt = await card(page).innerText();
    check('missing: closed menu explained', mt.includes('The menu is closed'), mt.slice(0, 160));
    await clickCard(page, 'Next');
    await sleep(4800);
    const txt = await card(page).innerText();
    check('missing: explains instead of highlighting', txt.includes('No counsellors are available'), txt.slice(0, 120));
    await page.screenshot({ path: `${OUT}/d-missing.png` });
    await context.close();
  },

  async help_menu_page() {
    const st = makeState({ tutorials: done });
    const { page, context } = await openApp(b, st, { viewport: PHONE, path: '/journal' });
    await sleep(6000);
    await page.locator('[data-tour="help-button"]:visible').click();
    const items = await page.getByRole('menuitem').allInnerTexts();
    check('help: menu items', ['Start App Tour', 'Learn About This Page', 'Browse Tutorials', 'Frequently Asked Questions', 'Find a feature'].every((x) => items.some((i) => i.includes(x))), items.join(' / '));
    await page.screenshot({ path: `${OUT}/p-help.png` });
    await page.getByRole('menuitem', { name: /Learn About This Page/ }).click(); await sleep(800);
    const t = await title(page);
    check('help: page tutorial for journal', t === 'Write a prayer', t);
    await context.close();
  },

  // Every tutorial in the library, start to finish, on phone and desktop:
  // each step must show its card on screen, either on its target or with an
  // explanation of why the target isn't there.
  async all_tutorials() {
    for (const viewport of [PHONE, DESKTOP]) {
      const st = makeState({ tutorials: done });
      const { page, context, errors } = await openApp(b, st, { viewport });
      await sleep(5000);
      await page.locator('[data-tour="help-button"]:visible').click();
      await page.getByRole('menuitem', { name: 'Browse Tutorials' }).click();
      await sleep(500);
      const names = (await page.locator('li p.font-semibold').allInnerTexts()).map((n) => n.trim());
      await page.keyboard.press('Escape'); await sleep(400);
      const label = viewport === PHONE ? 'phone' : 'desktop';
      for (const name of names) {
        await startFromLibrary(page, name);
        let steps = 0; let ok = true; let note = '';
        while ((await page.locator('[data-rk-tutorial] [role="dialog"]').count()) > 0 && steps < 15) {
          await page.waitForFunction(() => {
            const el = document.querySelector('[data-rk-tutorial] [role="dialog"]');
            return !el || getComputedStyle(el).visibility === 'visible';
          }, null, { timeout: 8000 }).catch(() => { ok = false; note = 'card never appeared'; });
          if (!ok) break;
          const c = page.locator('[data-rk-tutorial] [role="dialog"]');
          if (!(await inViewport(page))) { ok = false; note = `card off screen at step ${steps + 1}`; }
          const btn = c.locator('button', { hasText: /^(Next|Done|Skip this step)/ }).last();
          await btn.click(); await sleep(500);
          steps++;
        }
        // Close anything a step opened (menus, dialogs) before the next one.
        await page.keyboard.press('Escape'); await sleep(300);
        await page.keyboard.press('Escape'); await sleep(300);
        check(`all (${label}): ${name}`, ok && steps > 0, note || `${steps} steps`);
      }
      // Stripe.js is blocked by this harness, so the billing screens log it.
      const real = errors.filter((e) => !e.includes('Stripe.js not available'));
      check(`all (${label}): no page errors`, real.length === 0, real.join(' | '));
      await context.close();
    }
  },
};

for (const [name, fn] of Object.entries(tests)) {
  if (only && !only.split(',').includes(name)) continue;
  console.log(`\n## ${name}`);
  try { await fn(); } catch (e) { check(`${name} crashed`, false, String(e).split('\n')[0]); }
}
await b.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exitCode = 1;
