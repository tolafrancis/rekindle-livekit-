import { IngressClient } from 'https://esm.sh/livekit-server-sdk@2';

const httpUrl = (wsUrl: string) => wsUrl.replace(/^ws/, 'http');

// Read from env or fallback to values in apps/rekindle/.env
let url = Deno.env.get('LIVEKIT_URL');
let key = Deno.env.get('LIVEKIT_API_KEY');
let secret = Deno.env.get('LIVEKIT_API_SECRET');

if (!url || !key || !secret) {
  try {
    const envText = Deno.readTextFileSync('apps/rekindle/.env');
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
  Deno.exit(1);
}

const TARGET_ROOMS = [
  'channel-7ccbdb07-5670-4610-b100-990a78e70d4b',
  'channel-6cd33b83-b6a1-4b62-a3be-4c59203bf179',
];

const shouldDelete = Deno.args.includes('--delete');

console.log(`Connecting to LiveKit server at ${httpUrl(url)}...`);
const ingressClient = new IngressClient(httpUrl(url), key, secret);

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

  const toDelete = ingresses.filter((item: any) => TARGET_ROOMS.includes(item.roomName));

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
    console.log('\n[DRY RUN / LIST MODE]');
    console.log('To delete the target orphaned ingresses, run this script with --delete:');
    console.log('  deno run --allow-net --allow-read scripts/cleanup-ingresses.ts --delete');
  }
} catch (err) {
  console.error('Error interacting with LiveKit IngressClient:', err);
  Deno.exit(1);
}
