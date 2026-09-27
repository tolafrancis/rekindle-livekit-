// Run with: node scripts/test-scripture.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScriptureDetector, parseReference, formatReference, type ScriptureDetection } from './parser';

const first = (text: string): ScriptureDetection | undefined => new ScriptureDetector().scan(text)[0];

// [what the speaker said, expected reference or null, expected status]
const SINGLE_LINE: Array<[string, string | null, ('confirmed' | 'suggest')?]> = [
  // Written, explicit
  ['John chapter three verse 16.', 'John 3:16', 'confirmed'],
  ['John 3:16', 'John 3:16', 'confirmed'],
  ['For God so loved the world, John 3:16.', 'John 3:16', 'confirmed'],
  ['Romans 8:28-30', 'Romans 8:28-30', 'confirmed'],
  ['Romans 8:28–30', 'Romans 8:28-30', 'confirmed'],
  ['Romans 8:28 to 30', 'Romans 8:28-30', 'confirmed'],
  ['Psalm 23:1-6', 'Psalm 23:1-6', 'confirmed'],
  ['Psalms 91:1', 'Psalm 91:1', 'confirmed'],
  ['1 Corinthians 13:4', '1 Corinthians 13:4', 'confirmed'],
  ['2 Corinthians 5:17', '2 Corinthians 5:17', 'confirmed'],
  ['1 John 1:9', '1 John 1:9', 'confirmed'],
  ['3 John 1:2', '3 John 1:2', 'confirmed'],
  ['Genesis 1:1', 'Genesis 1:1', 'confirmed'],
  ['Revelation 3:20', 'Revelation 3:20', 'confirmed'],
  ['Revelations 21:4', 'Revelation 21:4', 'confirmed'],
  ['Song of Solomon 2:4', 'Song of Solomon 2:4', 'confirmed'],
  ['Song of Songs 8:6', 'Song of Solomon 8:6', 'confirmed'],
  ['Jude 1:24', 'Jude 1:24', 'confirmed'],
  ['Obadiah 1:15', 'Obadiah 1:15', 'confirmed'],
  ['Philippians 4:13', 'Philippians 4:13', 'confirmed'],
  ['Phillipians 4:13', 'Philippians 4:13', 'confirmed'],
  ['Philipians 4:6-7', 'Philippians 4:6-7', 'confirmed'],
  ['Hebrews 11:1', 'Hebrews 11:1', 'confirmed'],
  ['Isaiah 40:31', 'Isaiah 40:31', 'confirmed'],
  ['Jeremiah 29:11', 'Jeremiah 29:11', 'confirmed'],
  ['Proverbs 3:5-6', 'Proverbs 3:5-6', 'confirmed'],
  ['Matthew 28:19', 'Matthew 28:19', 'confirmed'],
  ['Mathew 6:33', 'Matthew 6:33', 'confirmed'],
  ['Acts 2:38', 'Acts 2:38', 'confirmed'],
  ['Joshua 1:9', 'Joshua 1:9', 'confirmed'],
  ['Psalm 119:105', 'Psalm 119:105', 'confirmed'],
  ['Psalm 119:176', 'Psalm 119:176', 'confirmed'],
  ['Rom 12:2', 'Romans 12:2', 'confirmed'],
  ['1 Cor 13:4', '1 Corinthians 13:4', 'confirmed'],
  ['Jn 14:6', 'John 14:6', 'confirmed'],
  ['Mic 6:8', 'Micah 6:8', 'confirmed'],
  ['John 3.16', 'John 3:16', 'confirmed'],

  // Written with words
  ['John chapter 3 verse 16', 'John 3:16', 'confirmed'],
  ['Romans chapter 8 verse 28', 'Romans 8:28', 'confirmed'],
  ['Romans chapter 8 verses 28 to 30', 'Romans 8:28-30', 'confirmed'],
  ['Romans chapter 8 verses 28 through 30', 'Romans 8:28-30', 'confirmed'],
  ['Matthew chapter 5 verses 3 and 4', 'Matthew 5:3-4', 'confirmed'],
  ['First Corinthians 13 verse 4', '1 Corinthians 13:4', 'confirmed'],

  // Spoken, as speech-to-text writes it
  ['John three sixteen', 'John 3:16', 'confirmed'],
  ['john three verse sixteen', 'John 3:16', 'confirmed'],
  ['Romans eight twenty eight', 'Romans 8:28', 'confirmed'],
  ['Romans eight twenty-eight', 'Romans 8:28', 'confirmed'],
  ['Second Timothy chapter one verse seven', '2 Timothy 1:7', 'confirmed'],
  ['second timothy one seven', '2 Timothy 1:7', 'confirmed'],
  ['First John one nine', '1 John 1:9', 'confirmed'],
  ['1st John 4:8', '1 John 4:8', 'confirmed'],
  ['2nd Chronicles 7:14', '2 Chronicles 7:14', 'confirmed'],
  ['Second Chronicles seven fourteen', '2 Chronicles 7:14', 'confirmed'],
  ['Philippians four thirteen', 'Philippians 4:13', 'confirmed'],
  ['Jeremiah twenty nine eleven', 'Jeremiah 29:11', 'confirmed'],
  ['Psalm one hundred and nineteen verse one hundred and five', 'Psalm 119:105', 'confirmed'],
  ['Psalm one hundred nineteen verse one hundred five', 'Psalm 119:105', 'confirmed'],
  ['Genesis one one', 'Genesis 1:1', 'confirmed'],
  ['Hebrews eleven one', 'Hebrews 11:1', 'confirmed'],
  ['Acts two thirty eight', 'Acts 2:38', 'confirmed'],
  ['Ephesians two eight through nine', 'Ephesians 2:8-9', 'confirmed'],
  ['Isaiah forty thirty one', 'Isaiah 40:31', 'confirmed'],
  ['Let us read from Proverbs three five', 'Proverbs 3:5', 'confirmed'],
  ['II Timothy 3:16', '2 Timothy 3:16', 'confirmed'],
  ['III John 1:2', '3 John 1:2', 'confirmed'],

  // Chapter only: suggested, never confirmed
  ['Psalm 23', 'Psalm 23', 'suggest'],
  ['Psalm twenty three', 'Psalm 23', 'suggest'],
  ["Let's read Psalm 23.", 'Psalm 23', 'suggest'],
  ['First Corinthians thirteen', '1 Corinthians 13', 'suggest'],
  ['Turn with me to John chapter 3', 'John 3', 'suggest'],
  ['Romans 12', 'Romans 12', 'suggest'],
  ['Genesis chapter one', 'Genesis 1', 'suggest'],

  // False positives: never a reference
  ['John said we should pray', null],
  ['John mentioned something interesting', null],
  ['Romans', null],
  ['The Romans were a great empire', null],
  ['Mark my words', null],
  ['Mark 2 people absent', null],
  ['I lost my job 5 years ago', null],
  ['He acts 3 times a week', null],
  ['Can you check mic 2', null],
  ['James 5 minutes late', null],
  ['Pass me the Col 3 cable', null],
  ['We had 23 people in the Psalms class', null],
  ['Numbers are up this month', null],
  ['Luke 3 friends came', null],
  ['Daniel 4 years old', null],

  // Invalid chapters and verses are rejected
  ['John 30:1', null],
  ['John 3:99', null],
  ['Jude 2:1', null],
  ['Psalm 151', null],
  ['Romans 8:28-99', null],
  ['Genesis 51', null],
];

for (const [said, expected, status] of SINGLE_LINE) {
  test(`"${said}" → ${expected ?? 'nothing'}`, () => {
    const d = first(said);
    if (expected === null) {
      assert.equal(d, undefined, `unexpected ${d && formatReference(d.reference)}`);
      return;
    }
    assert.ok(d, 'no reference found');
    assert.equal(formatReference(d.reference), expected);
    if (status) assert.equal(d.status, status);
  });
}

test('context: "verse sixteen" after "John chapter 3" resolves to John 3:16', () => {
  const det = new ScriptureDetector();
  det.scan("Let's turn to John chapter 3.", null, 0);
  const d = det.scan('Verse sixteen says, for God so loved the world', null, 20_000)[0];
  assert.ok(d);
  assert.equal(formatReference(d.reference), 'John 3:16');
  assert.equal(d.status, 'confirmed');
  assert.equal(d.kind, 'context');
});

test('context: ranges resolve too', () => {
  const det = new ScriptureDetector();
  det.scan('Open your Bibles to Romans chapter 8', null, 0);
  const d = det.scan('verses 28 to 30', null, 5_000)[0];
  assert.equal(formatReference(d.reference), 'Romans 8:28-30');
});

test('context: a new chapter keeps the book', () => {
  const det = new ScriptureDetector();
  det.scan('Psalm 22', null, 0);
  assert.equal(formatReference(det.scan('now chapter 23', null, 1_000)[0].reference), 'Psalm 23');
  assert.equal(formatReference(det.scan('verse 4', null, 2_000)[0].reference), 'Psalm 23:4');
});

test('context: "chapter 5 verse 3" after a book resolves', () => {
  const det = new ScriptureDetector();
  det.scan('We are in Matthew chapter 4', null, 0);
  assert.equal(formatReference(det.scan('then chapter 5 verse 3', null, 1_000)[0].reference), 'Matthew 5:3');
});

test('context: carries over from a full reference', () => {
  const det = new ScriptureDetector();
  det.scan('John 3:16', null, 0);
  assert.equal(formatReference(det.scan('and verse 17 goes on', null, 10_000)[0].reference), 'John 3:17');
});

test('context: expires after 90 seconds by default', () => {
  const det = new ScriptureDetector();
  det.scan('John chapter 3', null, 0);
  assert.deepEqual(det.scan('verse 16', null, 91_000), []);
});

test('context: expiry is configurable', () => {
  const det = new ScriptureDetector({ contextMs: 5_000 });
  det.scan('John chapter 3', null, 0);
  assert.deepEqual(det.scan('verse 16', null, 6_000), []);
});

test('context: each use keeps it alive', () => {
  const det = new ScriptureDetector();
  det.scan('John chapter 3', null, 0);
  det.scan('verse 16', null, 80_000);
  assert.equal(det.scan('verse 17', null, 160_000).length, 1);
});

test('context: "verse 16" with no book named first is ignored', () => {
  assert.deepEqual(new ScriptureDetector().scan('verse 16 says'), []);
});

test('context: an invalid verse for the remembered chapter is ignored', () => {
  const det = new ScriptureDetector();
  det.scan('John chapter 3', null, 0);
  assert.deepEqual(det.scan('verse 40', null, 1_000), []);
});

test('split line: a book ending one caption line joins "chapter one verse two" in the next', () => {
  const det = new ScriptureDetector();
  assert.deepEqual(det.scan('Second Corinthians', null, 0), []);
  const d = det.scan('chapter one verse two.', null, 3_000)[0];
  assert.equal(formatReference(d.reference), '2 Corinthians 1:2');
  assert.equal(d.status, 'confirmed');
});

test('split line: "turn with me to Romans" then "chapter 8" is only a suggestion', () => {
  const det = new ScriptureDetector();
  det.scan('turn with me to Romans', null, 0);
  const d = det.scan('chapter 8', null, 2_000)[0];
  assert.equal(formatReference(d.reference), 'Romans 8');
  assert.equal(d.status, 'suggest');
});

test('split line: a bare book never resolves "verse N" on its own', () => {
  const det = new ScriptureDetector();
  det.scan('Second Corinthians', null, 0);
  assert.deepEqual(det.scan('verse 2', null, 1_000), []);
});

test('split line: the book on its own is forgotten after 20 seconds', () => {
  const det = new ScriptureDetector();
  det.scan('Second Corinthians', null, 0);
  assert.deepEqual(det.scan('chapter one verse two', null, 21_000), []);
});

test('split line: a book mid-sentence does not carry over', () => {
  const det = new ScriptureDetector();
  det.scan('Paul wrote Romans to the church', null, 0);
  assert.deepEqual(det.scan('chapter one verse two', null, 1_000), []);
});

test('reset() forgets the context', () => {
  const det = new ScriptureDetector();
  det.scan('John chapter 3', null, 0);
  det.reset();
  assert.deepEqual(det.scan('verse 16', null, 1_000), []);
});

test('several references in one line come back in order', () => {
  const found = new ScriptureDetector().scan('Compare John 3:16 with Romans 5:8 and 1 John 4:9');
  assert.deepEqual(found.map(d => formatReference(d.reference)), ['John 3:16', 'Romans 5:8', '1 John 4:9']);
});

test('the original transcript is scanned before the translation', () => {
  const d = new ScriptureDetector().scan('John 3:16', 'Giăng 3:17');
  assert.equal(formatReference(d[0].reference), 'John 3:16');
});

test('the translation is used when the original has no reference', () => {
  const d = new ScriptureDetector().scan('Giăng ba mười sáu', 'John 3:16');
  assert.equal(formatReference(d[0].reference), 'John 3:16');
});

test('empty and missing text is safe', () => {
  const det = new ScriptureDetector();
  assert.deepEqual(det.scan(''), []);
  assert.deepEqual(det.scan('', null), []);
  assert.deepEqual(det.scan('   ', '  '), []);
});

test('references carry the USFM book id for providers', () => {
  const d = first('1 Corinthians 13:4-7')!;
  assert.deepEqual(d.reference, { bookId: '1CO', book: '1 Corinthians', chapter: 13, startVerse: 4, endVerse: 7 });
});

test('parseReference: typed entry', () => {
  assert.equal(formatReference(parseReference('John 3:16')!), 'John 3:16');
  assert.equal(formatReference(parseReference('jn 3:16')!), 'John 3:16');
  assert.equal(formatReference(parseReference('rom 8 28')!), 'Romans 8');
  assert.equal(formatReference(parseReference('John 3')!), 'John 3');
  assert.equal(formatReference(parseReference('psalm 23')!), 'Psalm 23');
  assert.equal(parseReference('John'), null);
  assert.equal(parseReference('hello'), null);
  assert.equal(parseReference('John 22:1'), null);
});
