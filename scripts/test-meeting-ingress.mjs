import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vpnpembyqbbaaiynfvli.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwbnBlbWJ5cWJiYWFpeW5mdmxpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MDQ1NTYsImV4cCI6MjA4MDQ4MDU1Nn0.Ij4KhYKntuAmCthL2dGJk4pfWa2gIq3QER4wt6oExd8';

const MEETING_ID = '8434aca0-1e50-4a28-9363-6fa93ef20e0c';
const HOST_USER_ID = '335cc543-7342-43c9-bf29-5f7a334796f6';

const authToken = process.env.AUTH_TOKEN || process.env.HOST_JWT;

let supabase;

if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  // Service role mode (can query DB directly and bypass auth for testing)
  supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
} else {
  // User JWT mode
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    },
  });
}

async function provisionChannelStream(context) {
  const isMeeting = context.kind !== 'channel';
  const body = {
    action: 'create',
    context: { kind: context.kind, [isMeeting ? 'meetingId' : 'channelId']: context.id },
    [isMeeting ? 'meetingId' : 'channelId']: context.id,
    roomName: context.id,
  };
  const { data, error } = await supabase.functions.invoke('livekit-ingress', { body });
  if (error) throw new Error(error.message || JSON.stringify(error));
  return data;
}

async function getChannelStreamCreds(context) {
  const isMeeting = context.kind !== 'channel';
  const body = {
    action: 'get',
    context: { kind: context.kind, [isMeeting ? 'meetingId' : 'channelId']: context.id },
    [isMeeting ? 'meetingId' : 'channelId']: context.id,
    roomName: context.id,
  };
  const { data, error } = await supabase.functions.invoke('livekit-ingress', { body });
  if (error) throw new Error(error.message || JSON.stringify(error));
  return data;
}

async function runTest() {
  console.log(`=== Testing Meeting Ingress for meeting: ${MEETING_ID} (host: ${HOST_USER_ID}) ===\n`);

  // Step 1: Call provisionChannelStream
  console.log('1. Calling provisionChannelStream({ kind: "ministry_meeting", id: "${MEETING_ID}" })...');
  const ctx = { kind: 'ministry_meeting', id: MEETING_ID };
  const provisionResult = await provisionChannelStream(ctx);
  console.log('Provision Result:', JSON.stringify(provisionResult, null, 2));

  // Step 2: Query meeting_streams directly
  console.log('\n2. Querying meeting_streams directly for meeting_id...');
  const { data: streamRow, error: streamErr } = await supabase
    .from('meeting_streams')
    .select('*')
    .eq('meeting_id', MEETING_ID)
    .maybeSingle();

  if (streamErr) console.error('Error querying meeting_streams:', streamErr.message);
  else console.log('meeting_streams Row:', JSON.stringify(streamRow, null, 2));

  // Step 3: Call getChannelStreamCreds (idempotence test)
  console.log('\n3. Calling getChannelStreamCreds (testing idempotent reuse)...');
  const getCredsResult = await getChannelStreamCreds(ctx);
  console.log('Get Creds Result:', JSON.stringify(getCredsResult, null, 2));

  // Step 4: Verify match
  if (provisionResult?.ingressId && getCredsResult?.ingressId === provisionResult.ingressId) {
    console.log('\n✅ SUCCESS: getChannelStreamCreds returned matching existing ingress credentials!');
  } else {
    console.log('\n⚠️ WARNING: Credentials check complete.');
  }
}

runTest().catch((err) => {
  console.error('\n❌ Test execution failed:', err);
  process.exit(1);
});
