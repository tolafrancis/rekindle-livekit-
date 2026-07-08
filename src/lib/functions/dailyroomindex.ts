// Supabase Edge Function: daily-room
// ENHANCED VERSION with better Daily.co credit/payment error detection
// Deploy with: supabase functions deploy daily-room

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DAILY_API_KEY = Deno.env.get('DAILY_API_KEY')
const DAILY_API_BASE = 'https://api.daily.co/v1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RoomRequest {
  roomName: string
  userName: string
  userId: string
  isHost: boolean
}

interface DailyErrorResponse {
  error?: string
  info?: string
  message?: string
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Check if Daily API key is configured
    if (!DAILY_API_KEY) {
      console.error('[daily-room] DAILY_API_KEY environment variable not set')
      return new Response(
        JSON.stringify({ 
          error: 'Daily.co API key not configured',
          details: 'The DAILY_API_KEY environment variable is missing. Please configure it in Supabase.',
          userMessage: 'Video service is not configured. Please contact support.'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        }
      )
    }

    // Parse request body
    const { roomName, userName, userId, isHost }: RoomRequest = await req.json()

    console.log('[daily-room] Creating room:', { roomName, userName, userId, isHost })

    // Validate inputs
    if (!roomName || !userName || !userId) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing required fields: roomName, userName, userId',
          userMessage: 'Invalid request. Please try again.'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      )
    }

    // Create or get room
    let room
    let roomCreated = false

    // Try to create room
    console.log('[daily-room] Sending create room request to Daily.co...')
    const createRoomResponse = await fetch(`${DAILY_API_BASE}/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DAILY_API_KEY}`
      },
      body: JSON.stringify({
        name: roomName,
        privacy: 'public',
        properties: {
          enable_screenshare: true,
          enable_chat: true,
          enable_knocking: false,
          enable_prejoin_ui: false,
          enable_recording: 'cloud', // Enable cloud recording (requires paid plan)
          eject_at_room_exp: true,
          exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24), // Expires in 24 hours
          max_participants: 100
        }
      })
    })

    const responseStatus = createRoomResponse.status
    console.log('[daily-room] Daily.co response status:', responseStatus)

    if (createRoomResponse.status === 200 || createRoomResponse.status === 201) {
      room = await createRoomResponse.json()
      roomCreated = true
      console.log('[daily-room] Room created:', room.name)
    } else if (createRoomResponse.status === 400) {
      // Room might already exist, try to get it
      console.log('[daily-room] Room may already exist, attempting to fetch...')
      
      const getRoomResponse = await fetch(`${DAILY_API_BASE}/rooms/${roomName}`, {
        headers: {
          'Authorization': `Bearer ${DAILY_API_KEY}`
        }
      })
      
      if (getRoomResponse.ok) {
        room = await getRoomResponse.json()
        console.log('[daily-room] Existing room fetched:', room.name)
      } else {
        const errorData: DailyErrorResponse = await getRoomResponse.json().catch(() => ({}))
        console.error('[daily-room] Failed to get existing room:', errorData)
        
        // Check for specific error types
        return handleDailyError(getRoomResponse.status, errorData, 'get room')
      }
    } else {
      // Handle error responses with detailed error parsing
      const errorData: DailyErrorResponse = await createRoomResponse.json().catch(() => ({}))
      console.error('[daily-room] Failed to create room. Status:', responseStatus, 'Error:', errorData)
      
      return handleDailyError(createRoomResponse.status, errorData, 'create room')
    }

    // Create meeting token for the user
    console.log('[daily-room] Creating meeting token for user:', userName)
    
    const tokenResponse = await fetch(`${DAILY_API_BASE}/meeting-tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DAILY_API_KEY}`
      },
      body: JSON.stringify({
        properties: {
          room_name: roomName,
          user_name: userName,
          user_id: userId,
          is_owner: isHost,
          enable_screenshare: true,
          enable_recording: isHost ? 'cloud' : false,
          start_video_off: true,
          start_audio_off: true,
          // Token expires in 24 hours
          exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24)
        }
      })
    })

    if (!tokenResponse.ok) {
      const errorData: DailyErrorResponse = await tokenResponse.json().catch(() => ({}))
      console.error('[daily-room] Failed to create meeting token. Status:', tokenResponse.status, 'Error:', errorData)
      
      return handleDailyError(tokenResponse.status, errorData, 'create meeting token')
    }

    const { token } = await tokenResponse.json()
    console.log('[daily-room] Meeting token created successfully')

    // Return room URL and token
    const response = {
      url: room.url,
      token: token,
      roomName: room.name,
      created: roomCreated,
      config: room.config
    }

    console.log('[daily-room] Success - returning room data')
    
    return new Response(
      JSON.stringify(response),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error: any) {
    console.error('[daily-room] Unexpected error:', error)
    
    return new Response(
      JSON.stringify({ 
        error: 'Unexpected error occurred',
        details: error.toString(),
        userMessage: 'An unexpected error occurred. Please try again later.'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})

/**
 * Handle Daily.co API errors with specific user-friendly messages
 */
function handleDailyError(status: number, errorData: DailyErrorResponse, operation: string) {
  let userMessage = 'Failed to start video. Please try again.'
  let error = errorData.error || errorData.message || 'Unknown error'
  let statusCode = status

  console.log('[daily-room] Handling Daily.co error:', { status, error, operation })

  // Parse specific error scenarios
  switch (status) {
    case 401:
    case 403:
      // Authentication/authorization errors
      error = 'Invalid Daily.co API key'
      userMessage = 'Video service authentication failed. Please contact support.'
      statusCode = 401
      break

    case 402:
      // Payment required - THIS IS THE KEY ONE FOR YOUR CASE
      error = 'Daily.co payment required'
      userMessage = '⚠️ Daily.co account needs payment or credits. The free tier may have been exhausted. Please add credits to your Daily.co account.'
      statusCode = 402
      break

    case 429:
      // Rate limit
      error = 'Daily.co API rate limit exceeded'
      userMessage = 'Too many requests. Please wait a moment and try again.'
      statusCode = 429
      break

    case 503:
    case 504:
      // Service unavailable
      error = 'Daily.co service temporarily unavailable'
      userMessage = 'Video service is temporarily unavailable. Please try again in a few minutes.'
      statusCode = 503
      break

    default:
      // Check error message content for specific issues
      const errorMsg = (error || '').toLowerCase()
      
      if (errorMsg.includes('credit') || errorMsg.includes('payment') || errorMsg.includes('billing')) {
        error = 'Daily.co account billing issue detected'
        userMessage = '💳 Daily.co account requires payment setup. Please add credits or set up billing in your Daily.co dashboard.'
        statusCode = 402
      } else if (errorMsg.includes('limit') || errorMsg.includes('quota')) {
        error = 'Daily.co account limit reached'
        userMessage = '📊 Daily.co account limit reached. You may need to upgrade your plan or wait for quota reset.'
        statusCode = 429
      } else if (errorMsg.includes('unauthorized') || errorMsg.includes('forbidden')) {
        error = 'Daily.co API authorization failed'
        userMessage = 'Video service authorization failed. Please contact support.'
        statusCode = 401
      }
  }

  console.error(`[daily-room] ${operation} failed:`, { status: statusCode, error, userMessage })

  return new Response(
    JSON.stringify({ 
      error,
      details: errorData,
      userMessage,
      operation,
      statusCode
    }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: statusCode
    }
  )
}