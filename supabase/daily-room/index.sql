const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const DAILY_API_BASE = 'https://api.daily.co/v1';

interface CreateRoomRequest {
  action: 'create-room';
  roomName?: string;
  expiresInMinutes?: number;
  maxParticipants?: number;
  enableChat?: boolean;
  enableKnocking?: boolean;
  startVideoOff?: boolean;
  startAudioOff?: boolean;
  ownerOnlyBroadcast?: boolean;
  enableRecording?: boolean;
  enableScreenShare?: boolean;
}

interface GenerateTokenRequest {
  action: 'generate-token';
  roomName: string;
  userName: string;
  userId?: string;
  isOwner?: boolean;
  expiresInMinutes?: number;
  enableRecording?: boolean;
  startVideoOff?: boolean;
  startAudioOff?: boolean;
}

interface GetRoomRequest {
  action: 'get-room';
  roomName: string;
}

interface DeleteRoomRequest {
  action: 'delete-room';
  roomName: string;
}

interface ListRoomsRequest {
  action: 'list-rooms';
  limit?: number;
  endingBefore?: string;
  startingAfter?: string;
}

interface GetOrCreateRoomRequest {
  action: 'get-or-create-room';
  roomName: string;
  expiresInMinutes?: number;
  maxParticipants?: number;
  enableChat?: boolean;
  enableKnocking?: boolean;
  startVideoOff?: boolean;
  startAudioOff?: boolean;
  ownerOnlyBroadcast?: boolean;
  enableRecording?: boolean;
  enableScreenShare?: boolean;
}

interface CleanupExpiredRoomsRequest {
  action: 'cleanup-expired-rooms';
  dryRun?: boolean; // If true, only report what would be deleted
}

type RequestBody = CreateRoomRequest | GenerateTokenRequest | GetRoomRequest | DeleteRoomRequest | ListRoomsRequest | GetOrCreateRoomRequest | CleanupExpiredRoomsRequest;

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
  
  // Return null for 404 (room not found) - useful for checking if room exists
  if (response.status === 404) {
    return null;
  }
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error || errorData.info || `Daily.co API error: ${response.status}`;
    const error = new Error(errorMessage);
    (error as any).status = response.status;
    (error as any).dailyError = errorData;
    throw error;
  }

  return response.json();
}

function generateRoomName(prefix = 'prayer-room'): string {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${randomStr}`;
}

async function getRoomIfExists(roomName: string) {
  try {
    const room = await dailyApiRequest(`/rooms/${roomName}`, 'GET');
    return room;
  } catch (error) {
    // Room doesn't exist
    return null;
  }
}

async function createRoom(params: CreateRoomRequest) {
  const roomName = params.roomName || generateRoomName();
  
  // Calculate expiration time (default 60 minutes from now)
  const expiresInMinutes = params.expiresInMinutes || 60;
  const expirationTime = Math.floor(Date.now() / 1000) + (expiresInMinutes * 60);

  const roomProperties: Record<string, unknown> = {
    name: roomName,
    privacy: 'private',
    properties: {
      exp: expirationTime,
      max_participants: params.maxParticipants || 50,
      enable_chat: params.enableChat !== false,
      enable_knocking: params.enableKnocking || false,
      start_video_off: params.startVideoOff || false,
      start_audio_off: params.startAudioOff || false,
      owner_only_broadcast: params.ownerOnlyBroadcast || false,
      enable_screenshare: params.enableScreenShare !== false,
      enable_recording: params.enableRecording ? 'cloud' : undefined,
      eject_at_room_exp: true,
      lang: 'en'
    }
  };

  try {
    const room = await dailyApiRequest('/rooms', 'POST', roomProperties);

    return {
      success: true,
      room: {
        id: room.id,
        name: room.name,
        url: room.url,
        createdAt: room.created_at,
        expiresAt: new Date(expirationTime * 1000).toISOString(),
        config: {
          maxParticipants: room.config?.max_participants,
          enableChat: room.config?.enable_chat,
          enableScreenShare: room.config?.enable_screenshare,
          startVideoOff: room.config?.start_video_off,
          startAudioOff: room.config?.start_audio_off
        }
      }
    };
  } catch (error: any) {
    // If room already exists (invalid-request-error often means this), try to get it
    if (error.message?.includes('invalid-request-error') || error.message?.includes('already exists')) {
      console.log(`Room ${roomName} might already exist, attempting to fetch it...`);
      const existingRoom = await getRoomIfExists(roomName);
      if (existingRoom) {
        return {
          success: true,
          room: {
            id: existingRoom.id,
            name: existingRoom.name,
            url: existingRoom.url,
            createdAt: existingRoom.created_at,
            expiresAt: existingRoom.config?.exp ? new Date(existingRoom.config.exp * 1000).toISOString() : null,
            config: {
              maxParticipants: existingRoom.config?.max_participants,
              enableChat: existingRoom.config?.enable_chat,
              enableScreenShare: existingRoom.config?.enable_screenshare,
              startVideoOff: existingRoom.config?.start_video_off,
              startAudioOff: existingRoom.config?.start_audio_off
            }
          },
          existingRoom: true
        };
      }
    }
    throw error;
  }
}

async function getOrCreateRoom(params: GetOrCreateRoomRequest) {
  const roomName = params.roomName;
  
  if (!roomName) {
    throw new Error('Room name is required for get-or-create-room action');
  }

  // First, try to get the existing room
  const existingRoom = await getRoomIfExists(roomName);
  
  if (existingRoom) {
    console.log(`Room ${roomName} already exists, returning existing room`);
    return {
      success: true,
      room: {
        id: existingRoom.id,
        name: existingRoom.name,
        url: existingRoom.url,
        createdAt: existingRoom.created_at,
        expiresAt: existingRoom.config?.exp ? new Date(existingRoom.config.exp * 1000).toISOString() : null,
        config: {
          maxParticipants: existingRoom.config?.max_participants,
          enableChat: existingRoom.config?.enable_chat,
          enableScreenShare: existingRoom.config?.enable_screenshare,
          startVideoOff: existingRoom.config?.start_video_off,
          startAudioOff: existingRoom.config?.start_audio_off
        }
      },
      existingRoom: true
    };
  }

  // Room doesn't exist, create it
  console.log(`Room ${roomName} doesn't exist, creating new room`);
  return createRoom({
    action: 'create-room',
    roomName: params.roomName,
    expiresInMinutes: params.expiresInMinutes,
    maxParticipants: params.maxParticipants,
    enableChat: params.enableChat,
    enableKnocking: params.enableKnocking,
    startVideoOff: params.startVideoOff,
    startAudioOff: params.startAudioOff,
    ownerOnlyBroadcast: params.ownerOnlyBroadcast,
    enableRecording: params.enableRecording,
    enableScreenShare: params.enableScreenShare
  });
}

async function generateToken(params: GenerateTokenRequest) {
  if (!params.roomName) {
    throw new Error('Room name is required to generate a token');
  }

  if (!params.userName) {
    throw new Error('User name is required to generate a token');
  }

  // Calculate token expiration (default 60 minutes)
  const expiresInMinutes = params.expiresInMinutes || 60;
  const expirationTime = Math.floor(Date.now() / 1000) + (expiresInMinutes * 60);

  const tokenProperties: Record<string, unknown> = {
    properties: {
      room_name: params.roomName,
      user_name: params.userName,
      user_id: params.userId || `user-${Date.now()}`,
      exp: expirationTime,
      is_owner: params.isOwner || false,
      enable_recording: params.enableRecording ? 'cloud' : undefined,
      start_video_off: params.startVideoOff || false,
      start_audio_off: params.startAudioOff || false,
      enable_screenshare: true,
      start_cloud_recording: false
    }
  };

  // Owner-specific permissions
  if (params.isOwner) {
    tokenProperties.properties = {
      ...tokenProperties.properties as object,
      enable_recording: 'cloud',
      start_cloud_recording: false,
      eject_at_token_exp: false,
      eject_after_elapsed: null
    };
  }

  const token = await dailyApiRequest('/meeting-tokens', 'POST', tokenProperties);

  return {
    success: true,
    token: token.token,
    roomName: params.roomName,
    userName: params.userName,
    isOwner: params.isOwner || false,
    expiresAt: new Date(expirationTime * 1000).toISOString()
  };
}

async function getRoom(params: GetRoomRequest) {
  if (!params.roomName) {
    throw new Error('Room name is required');
  }

  const room = await dailyApiRequest(`/rooms/${params.roomName}`, 'GET');
  
  if (!room) {
    return {
      success: false,
      error: 'Room not found',
      roomName: params.roomName
    };
  }

  return {
    success: true,
    room: {
      id: room.id,
      name: room.name,
      url: room.url,
      createdAt: room.created_at,
      config: room.config,
      apiCreated: room.api_created
    }
  };
}

async function deleteRoom(params: DeleteRoomRequest) {
  if (!params.roomName) {
    throw new Error('Room name is required');
  }

  try {
    await dailyApiRequest(`/rooms/${params.roomName}`, 'DELETE');

    return {
      success: true,
      message: `Room '${params.roomName}' has been deleted`,
      roomName: params.roomName
    };
  } catch (error: any) {
    // If room doesn't exist, consider it a success (idempotent delete)
    if (error.status === 404) {
      return {
        success: true,
        message: `Room '${params.roomName}' was already deleted or doesn't exist`,
        roomName: params.roomName,
        alreadyDeleted: true
      };
    }
    throw error;
  }
}

async function listRooms(params: ListRoomsRequest) {
  const queryParams = new URLSearchParams();
  
  if (params.limit) {
    queryParams.append('limit', params.limit.toString());
  }
  if (params.endingBefore) {
    queryParams.append('ending_before', params.endingBefore);
  }
  if (params.startingAfter) {
    queryParams.append('starting_after', params.startingAfter);
  }

  const queryString = queryParams.toString();
  const endpoint = `/rooms${queryString ? `?${queryString}` : ''}`;
  
  const response = await dailyApiRequest(endpoint, 'GET');

  return {
    success: true,
    rooms: response.data?.map((room: Record<string, unknown>) => ({
      id: room.id,
      name: room.name,
      url: room.url,
      createdAt: room.created_at,
      config: room.config
    })) || [],
    totalCount: response.total_count
  };
}

async function cleanupExpiredRooms(params: CleanupExpiredRoomsRequest) {
  const dryRun = params.dryRun || false;
  const now = Math.floor(Date.now() / 1000);
  
  console.log(`[Cleanup] Starting expired room cleanup (dryRun: ${dryRun})`);
  
  const expiredRooms: string[] = [];
  const deletedRooms: string[] = [];
  const failedDeletions: { name: string; error: string }[] = [];
  let totalRoomsChecked = 0;
  
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
    const response = await dailyApiRequest(endpoint, 'GET');
    
    if (!response?.data || response.data.length === 0) {
      hasMore = false;
      break;
    }
    
    totalRoomsChecked += response.data.length;
    
    for (const room of response.data) {
      const roomExp = room.config?.exp;
      
      // Check if room has expired
      if (roomExp && roomExp < now) {
        expiredRooms.push(room.name);
        
        if (!dryRun) {
          try {
            await dailyApiRequest(`/rooms/${room.name}`, 'DELETE');
            deletedRooms.push(room.name);
            console.log(`[Cleanup] Deleted expired room: ${room.name}`);
          } catch (error: any) {
            failedDeletions.push({
              name: room.name,
              error: error.message || 'Unknown error'
            });
            console.error(`[Cleanup] Failed to delete room ${room.name}:`, error.message);
          }
        }
      }
      
      // Update pagination cursor
      startingAfter = room.id;
    }
    
    // Check if there are more rooms
    if (response.data.length < 100) {
      hasMore = false;
    }
  }
  
  const result = {
    success: true,
    dryRun,
    totalRoomsChecked,
    expiredRoomsFound: expiredRooms.length,
    expiredRooms: expiredRooms,
    deletedRooms: dryRun ? [] : deletedRooms,
    deletedCount: dryRun ? 0 : deletedRooms.length,
    failedDeletions: dryRun ? [] : failedDeletions,
    failedCount: dryRun ? 0 : failedDeletions.length,
    timestamp: new Date().toISOString()
  };
  
  console.log(`[Cleanup] Complete. Checked: ${totalRoomsChecked}, Expired: ${expiredRooms.length}, Deleted: ${deletedRooms.length}, Failed: ${failedDeletions.length}`);
  
  return result;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Only accept POST requests
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed. Use POST.' }),
        {
          status: 405,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        }
      );
    }

    const body: RequestBody = await req.json();

    if (!body.action) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing action parameter',
          validActions: ['create-room', 'get-or-create-room', 'generate-token', 'get-room', 'delete-room', 'list-rooms', 'cleanup-expired-rooms']
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        }
      );
    }

    let result;

    switch (body.action) {
      case 'create-room':
        result = await createRoom(body as CreateRoomRequest);
        break;

      case 'get-or-create-room':
        result = await getOrCreateRoom(body as GetOrCreateRoomRequest);
        break;

      case 'generate-token':
        result = await generateToken(body as GenerateTokenRequest);
        break;

      case 'get-room':
        result = await getRoom(body as GetRoomRequest);
        break;

      case 'delete-room':
        result = await deleteRoom(body as DeleteRoomRequest);
        break;

      case 'list-rooms':
        result = await listRooms(body as ListRoomsRequest);
        break;

      case 'cleanup-expired-rooms':
        result = await cleanupExpiredRooms(body as CleanupExpiredRoomsRequest);
        break;

      default:
        return new Response(
          JSON.stringify({ 
            error: `Unknown action: ${body.action}`,
            validActions: ['create-room', 'get-or-create-room', 'generate-token', 'get-room', 'delete-room', 'list-rooms', 'cleanup-expired-rooms']
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          }
        );
    }

    return new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });

  } catch (error) {
    console.error('daily-room error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
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