import { IngressClient } from 'livekit-server-sdk';
import fs from 'fs';
import path from 'path';

// Read from env or fallback to values in apps/rekindle/.env
let url = process.env.LIVEKIT_URL;
let key = process.env.LIVEKIT_API_KEY;
let secret = process.env.LIVEKIT_API_SECRET;

if (!url || !key || !secret) {
  try {
    const envPath = path.resolve('apps/rekindle/.env');
    const envText = fs.readFileSync(envPath, 'utf8');
    for (const line of envText.split('\n')) {
      const match = line.trim().match(/^(LIVEKIT_[A-Z_]+)=(.*)$/);
      if (match) {
        if (match[1] === 'LIVEKIT_URL' && !url) url = match[2].trim();
        if (match[1] === 'LIVEKIT_API_KEY' && !key) key = match[2].trim();
        if (match[1] === 'LIVEKIT_API_SECRET' && !secret) secret = match[2].trim();
      }
    }
  } catch (_e) {
    // ignore
  }
}

if (!url || !key || !secret) {
  console.error('Error: LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET must be configured.');
  process.exit(1);
}

const httpUrl = (wsUrl) => wsUrl.replace(/^ws/, 'http');

const TARGET_ROOMS = [
  'channel-7ccbdb07-5670-4610-b100-990a78e70d4b',
  'channel-6cd33b83-b6a1-4b62-a3be-4c59203bf179',
];

const shouldDelete = process.argv.includes('--delete');

console.log(`Connecting to LiveKit server at ${httpUrl(url)}...`);
const ingressClient = new IngressClient(httpUrl(url), key, secret);

async function main() {
  try {
    const ingresses = await ingressClient.listIngress();
    console.log(`\nFound ${ingresses.length} total ingress object(s):\n`);

    if (ingresses.length === 0) {
      console.log('No active ingresses found.');
    } else {
      for (const item of ingresses) {
        const isTarget = TARGET_ROOMS.includes(item.roomName);
        console.log(` - ID: ${item.ingressId} | Room: ${item.roomName} | Name: ${item.name || '(none)'}${isTarget ? ' [ORPHAN TARGET]' : ''}`);
      }
    }

    const toDelete = ingresses.filter((item) => TARGET_ROOMS.includes(item.roomName));

    console.log(`\nOrphaned ingresses matching target rooms: ${toDelete.length}`);

    if (shouldDelete) {
      if (toDelete.length === 0) {
        console.log('No matching orphaned ingresses to delete.');
      } else {
        console.log('\nDeleting target orphaned ingresses...');
        for (const item of toDelete) {
          console.log(`Deleting ingress ${item.ingressId} (room: ${item.roomName})...`);
          await ingressClient.deleteIngress(item.ingressId);
          console.log(`Successfully deleted ${item.ingressId}`);
        }
        console.log('Deletion complete.');
      }
    } else {
      console.log('\n[LIST MODE]');
      console.log('Run with --delete to delete the target orphaned ingresses:');
      console.log('  node scripts/cleanup-ingresses.mjs --delete');
    }
  } catch (err) {
    console.error('Error interacting with LiveKit IngressClient:', err);
    process.exit(1);
  }
}

main();
