const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const DAILY_API_BASE = 'https://api.daily.co/v1';

interface CleanupResult {
  success: boolean;
  totalRoomsChecked: number;
  expiredRoomsFound: number;
  deletedCount: number;
  failedCount: number;
  deletedRooms: string[];
  failedDeletions: { name: string; error: string }[];
  timestamp: string;
}

async function dailyApiRequest(endpoint: string, method: string, body?: object) {
  const apiKey = Deno.env.get('DAILY_API_KEY');
  
  if (!apiKey) {
    throw new Error('DAILY_API_KEY environment variable is not configured');
  }

  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    }
  };

  if (body && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${DAILY_API_BASE}${endpoint}`, options);
  
  if (response.status === 404) {
    return null;
  }
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error || errorData.info || `Daily.co API error: ${response.status}`;
    const error = new Error(errorMessage);
    (error as any).status = response.status;
    throw error;
  }

  return response.json();
}

async function cleanupExpiredRooms(): Promise<CleanupResult> {
  const now = Math.floor(Date.now() / 1000);
  
  console.log('[Daily Cleanup] Starting scheduled cleanup of expired rooms');
  
  const deletedRooms: string[] = [];
  const failedDeletions: { name: string; error: string }[] = [];
  let totalRoomsChecked = 0;
  let expiredRoomsFound = 0;
  
  // Fetch all rooms (paginated)
  let hasMore = true;
  let startingAfter: string | undefined;
  
  while (hasMore) {
    const queryParams = new URLSearchParams();
    queryParams.append('limit', '100');
    if (startingAfter) {
      queryParams.append('starting_after', startingAfter);
    }
    
    const endpoint = `/rooms?${queryParams.toString()}`;
    
    let response;
    try {
      response = await dailyApiRequest(endpoint, 'GET');
    } catch (error: any) {
      console.error('[Daily Cleanup] Failed to fetch rooms:', error.message);
      break;
    }
    
    if (!response?.data || response.data.length === 0) {
      hasMore = false;
      break;
    }
    
    totalRoomsChecked += response.data.length;
    
    for (const room of response.data) {
      const roomExp = room.config?.exp;
      const roomName = room.name;
      
      // Check if room has expired
      if (roomExp && roomExp < now) {
        expiredRoomsFound++;
        
        try {
          await dailyApiRequest(`/rooms/${roomName}`, 'DELETE');
          deletedRooms.push(roomName);
          console.log(`[Daily Cleanup] Deleted expired room: ${roomName}`);
        } catch (error: any) {
          // If room is already deleted, consider it success
          if (error.status === 404) {
            deletedRooms.push(roomName);
            console.log(`[Daily Cleanup] Room already deleted: ${roomName}`);
          } else {
            failedDeletions.push({
              name: roomName,
              error: error.message || 'Unknown error'
            });
            console.error(`[Daily Cleanup] Failed to delete room ${roomName}:`, error.message);
          }
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Update pagination cursor
      startingAfter = room.id;
    }
    
    // Check if there are more rooms
    if (response.data.length < 100) {
      hasMore = false;
    }
  }
  
  const result: CleanupResult = {
    success: true,
    totalRoomsChecked,
    expiredRoomsFound,
    deletedCount: deletedRooms.length,
    failedCount: failedDeletions.length,
    deletedRooms,
    failedDeletions,
    timestamp: new Date().toISOString()
  };
  
  console.log(`[Daily Cleanup] Complete. Checked: ${totalRoomsChecked}, Expired: ${expiredRoomsFound}, Deleted: ${deletedRooms.length}, Failed: ${failedDeletions.length}`);
  
  return result;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Accept both GET (for cron jobs) and POST (for manual triggers)
    if (req.method !== 'POST' && req.method !== 'GET') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed. Use GET or POST.' }),
        {
          status: 405,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        }
      );
    }

    // Optional: Check for a secret key for scheduled invocations
    // This can be used with external cron services like cron-job.org
    const url = new URL(req.url);
    const secretKey = url.searchParams.get('key');
    const expectedKey = Deno.env.get('CLEANUP_SECRET_KEY');
    
    // If a secret key is configured, validate it
    if (expectedKey && secretKey !== expectedKey) {
      // Still allow authenticated Supabase requests
      const authHeader = req.headers.get('authorization');
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          }
        );
      }
    }

    console.log('[Daily Cleanup] Cleanup triggered at', new Date().toISOString());
    
    const result = await cleanupExpiredRooms();

    return new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });

  } catch (error) {
    console.error('[Daily Cleanup] Error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        timestamp: new Date().toISOString()
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    );
  }
});