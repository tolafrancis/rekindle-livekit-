// Run with: node scripts/test-meeting-layout.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LAYOUT_STATE, addSpotlight, clearSpotlights, layoutFromRoomMetadata, removeSpotlight,
  resolveStage, sanitizeLayoutState, setLayoutMode, spotlightOnly, swapSpeakers,
  MAX_SPOTLIGHT, recordingStageState, type MeetingLayoutState, type StageParticipant,
} from './meetingLayout';

const people = (...ids: string[]): StageParticipant[] => ids.map((id, i) => ({ sessionId: id, isLocal: i === 0 }));
const room = people('me', 'A', 'B', 'C', 'D');

const dual = (...ids: string[]): MeetingLayoutState => {
  let s = setLayoutMode(DEFAULT_LAYOUT_STATE, 'dual');
  for (const id of ids) {
    const r = addSpotlight(s, id);
    if ('error' in r) throw new Error(r.error);
    s = r.state;
  }
  return s;
};

test('A: two spotlit in Dual Speaker show side by side in spotlight order', () => {
  const stage = resolveStage({ state: dual('A', 'B'), participants: room });
  assert.equal(stage.kind, 'dual');
  assert.deepEqual(stage.main, ['A', 'B']);
  assert.deepEqual(stage.thumbnails, ['C', 'D']);
});

test('B: whoever is talking never reorders or enlarges the dual speakers', () => {
  const talking = room.map((p) => ({ ...p, isSpeaking: p.sessionId === 'B' || p.sessionId === 'C' }));
  const stage = resolveStage({ state: dual('A', 'B'), participants: talking, activeSpeakerId: 'C', recentSpeakers: ['C', 'B'] });
  assert.equal(stage.kind, 'dual');
  assert.deepEqual(stage.main, ['A', 'B']);
});

test('C: swap reverses left and right, and swapping twice restores it', () => {
  const s = swapSpeakers(dual('A', 'B'));
  assert.deepEqual(resolveStage({ state: s, participants: room }).main, ['B', 'A']);
  assert.deepEqual(swapSpeakers(s).spotlightParticipants, ['A', 'B']);
});

test('D: removing B falls back to Speaker on A; re-adding B goes back to Dual', () => {
  const without = removeSpotlight(dual('A', 'B'), 'B');
  const one = resolveStage({ state: without, participants: room });
  assert.equal(one.kind, 'speaker');
  assert.deepEqual(one.main, ['A']);
  const back = addSpotlight(without, 'B') as { state: MeetingLayoutState };
  assert.ok(back.state);
  assert.deepEqual(resolveStage({ state: back.state, participants: room }).main, ['A', 'B']);
});

test('D2: a spotlit person who leaves keeps their slot for when they return', () => {
  const s = dual('A', 'B');
  assert.equal(resolveStage({ state: s, participants: people('me', 'A', 'C') }).kind, 'speaker');
  assert.deepEqual(resolveStage({ state: s, participants: people('me', 'A', 'C', 'B') }).main, ['A', 'B']);
});

test('E: screen + dual puts the screen on stage with the two speakers below', () => {
  let s = dual('A', 'B');
  s = { ...s, screenShareMode: 'screen-dual' };
  const sharing = room.map((p) => ({ ...p, hasScreenShare: p.sessionId === 'C' }));
  const stage = resolveStage({ state: s, participants: sharing });
  assert.equal(stage.kind, 'screen');
  assert.equal(stage.screenOf, 'C');
  assert.deepEqual(stage.main, ['A', 'B']);
});

test('E2: screen + dual with nobody spotlit fills from the presenter', () => {
  const s = { ...DEFAULT_LAYOUT_STATE, screenShareMode: 'screen-dual' as const };
  const sharing = room.map((p) => ({ ...p, hasScreenShare: p.sessionId === 'C' }));
  assert.deepEqual(resolveStage({ state: s, participants: sharing }).main, ['C', 'me']);
});

test('E3: screen only has no camera tiles; screen + gallery has thumbnails', () => {
  const sharing = room.map((p) => ({ ...p, hasScreenShare: p.sessionId === 'C' }));
  const only = resolveStage({ state: { ...DEFAULT_LAYOUT_STATE, screenShareMode: 'screen-only' }, participants: sharing });
  assert.deepEqual(only.main, []);
  assert.deepEqual(only.thumbnails, []);
  const gallery = resolveStage({ state: { ...DEFAULT_LAYOUT_STATE, screenShareMode: 'screen-gallery' }, participants: sharing });
  assert.deepEqual(gallery.thumbnails, ['A', 'B', 'C', 'D']);
});

test('F: a local pin overrides the spotlight for this viewer only', () => {
  const s = dual('A', 'B');
  const pinned = resolveStage({ state: s, participants: room, pinnedId: 'D' });
  assert.equal(pinned.kind, 'speaker');
  assert.deepEqual(pinned.main, ['D']);
  assert.equal(pinned.reason, 'pin');
  assert.equal(resolveStage({ state: s, participants: room }).kind, 'dual');
});

test('G: state survives the metadata round trip every participant reads', () => {
  const s = dual('A', 'B');
  const meta = JSON.stringify({ locked: true, layout: s });
  assert.deepEqual(layoutFromRoomMetadata(meta), s);
  assert.equal(layoutFromRoomMetadata(JSON.stringify({ locked: true })), null);
  assert.equal(layoutFromRoomMetadata('not json'), null);
});

test('fallback: 0 spotlit uses the selected layout', () => {
  assert.equal(resolveStage({ state: setLayoutMode(DEFAULT_LAYOUT_STATE, 'gallery'), participants: room }).kind, 'gallery');
  const sp = resolveStage({ state: DEFAULT_LAYOUT_STATE, participants: room, activeSpeakerId: 'C' });
  assert.equal(sp.kind, 'speaker');
  assert.deepEqual(sp.main, ['C']);
  const multi = resolveStage({ state: setLayoutMode(DEFAULT_LAYOUT_STATE, 'multi'), participants: room, recentSpeakers: ['B', 'C', 'A', 'D', 'me'] });
  assert.equal(multi.kind, 'multi');
  assert.deepEqual(multi.main, ['B', 'C', 'A', 'D']);
});

test('fallback: 1 spotlit is Speaker, 3+ with Multi-Speaker is Multi', () => {
  const one = spotlightOnly(setLayoutMode(DEFAULT_LAYOUT_STATE, 'gallery'), 'A');
  assert.equal(resolveStage({ state: one, participants: room }).kind, 'speaker');
  let s = setLayoutMode(DEFAULT_LAYOUT_STATE, 'multi');
  for (const id of ['A', 'B', 'C']) s = (addSpotlight(s, id) as { state: MeetingLayoutState }).state;
  const stage = resolveStage({ state: s, participants: room });
  assert.equal(stage.kind, 'multi');
  assert.deepEqual(stage.main, ['A', 'B', 'C']);
});

test('limits: Dual holds two, spotlight holds nine', () => {
  const r = addSpotlight(dual('A', 'B'), 'C');
  assert.ok('error' in r);
  let s = setLayoutMode(DEFAULT_LAYOUT_STATE, 'multi');
  for (let i = 0; i < MAX_SPOTLIGHT; i++) s = (addSpotlight(s, `p${i}`) as { state: MeetingLayoutState }).state;
  assert.ok('error' in addSpotlight(s, 'one-too-many'));
  // Switching to Dual keeps the first two.
  assert.deepEqual(setLayoutMode(s, 'dual').spotlightParticipants, ['p0', 'p1']);
});

test('spotlight for everyone replaces the list; remove all clears it', () => {
  const s = spotlightOnly(dual('A', 'B'), 'C');
  assert.deepEqual(s.spotlightParticipants, ['C']);
  assert.deepEqual(clearSpotlights(s).spotlightParticipants, []);
});

test('every change bumps rev', () => {
  const a = DEFAULT_LAYOUT_STATE;
  const b = spotlightOnly(a, 'A');
  const c = swapSpeakers((addSpotlight(b, 'B') as { state: MeetingLayoutState }).state);
  assert.ok(b.rev > a.rev && c.rev > b.rev);
});

test('webinar hides the audience strip', () => {
  let s = setLayoutMode(DEFAULT_LAYOUT_STATE, 'webinar');
  s = (addSpotlight(s, 'A') as { state: MeetingLayoutState }).state;
  assert.deepEqual(resolveStage({ state: s, participants: room }).thumbnails, []);
});

test('sanitize drops junk and duplicates', () => {
  const s = sanitizeLayoutState({ layoutMode: 'dual', spotlightParticipants: ['A', 'A', 3, 'B', 'C'], screenShareMode: 'nope', rev: 4 });
  assert.ok(s);
  assert.deepEqual(s!.spotlightParticipants, ['A', 'B']);
  assert.equal(s!.screenShareMode, 'screen-speaker');
  assert.equal(sanitizeLayoutState('x'), null);
});

test('I: the recording layout ignores viewers and follows the host setting', () => {
  const s = dual('A', 'B');
  // Someone's local pin never reaches the recording: it isn't in the state.
  const rec = (layout: MeetingLayoutState['recordingLayout'], participants = room) =>
    resolveStage({ state: recordingStageState({ ...s, recordingLayout: layout }), participants, includeLocalInThumbnails: true });
  assert.equal(rec('gallery').kind, 'gallery');
  assert.equal(rec('gallery').thumbnails.length, 5);
  assert.deepEqual(rec('dual').main, ['A', 'B']);
  assert.deepEqual(rec('dual').thumbnails, []);
  assert.deepEqual(rec('speaker').main, ['A']);
  const sharing = room.map((p) => ({ ...p, hasScreenShare: p.sessionId === 'C' }));
  const sd = rec('screen-dual', sharing);
  assert.equal(sd.kind, 'screen');
  assert.deepEqual(sd.main, ['A', 'B']);
  assert.equal(rec('screen-speaker', sharing).screenMode, 'screen-speaker');
});
