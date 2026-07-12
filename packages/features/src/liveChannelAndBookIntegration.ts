// LiveChannels and BookSummaries Community Activity Integration
// This file contains the updates needed for live channels and book activities

import { 
  postLiveChannelJoined,
  postLiveChannelEventAttended,
  postBookStarted,
  postBookCompleted
} from './communityActivityService';

// =====================================================
// LIVE CHANNELS INTEGRATION
// =====================================================

// ====== ADD THESE IMPORTS TO LiveChannels.tsx ======
/*
import { 
  postLiveChannelJoined,
  postLiveChannelEventAttended
} from './communityActivityService';
*/

// ====== ADD THESE FUNCTIONS TO LiveChannels COMPONENT ======

/**
 * Post community activity when user joins a live channel
 */
const handleJoinLiveChannel = async (
  channel: LiveChannel,
  userId: string,
  userName: string,
  userAvatar: string | undefined
) => {
  try {
    await postLiveChannelJoined(
      userId,
      userName,
      userAvatar,
      channel.id,
      channel.name
    );
  } catch (error) {
    console.error('Error posting live channel join:', error);
  }
};

/**
 * Post community activity when user attends a live channel event
 */
const handleAttendLiveEvent = async (
  event: ChannelEvent,
  channelName: string,
  userId: string,
  userName: string,
  userAvatar: string | undefined
) => {
  try {
    await postLiveChannelEventAttended(
      userId,
      userName,
      userAvatar,
      event.id,
      event.title,
      channelName
    );
  } catch (error) {
    console.error('Error posting event attendance:', error);
  }
};

// ====== USAGE IN LiveChannels COMPONENT ======

/*
// When user joins a channel (watches a live stream), call:
// In the function that handles joining/watching a channel:

const watchChannel = async (channel: LiveChannel) => {
  if (!user || !profile) return;
  
  setSelectedChannel(channel);
  setViewMode('watch');
  
  // Post to community feed
  await handleJoinLiveChannel(
    channel,
    user.id,
    profile.full_name || profile.email || 'Anonymous',
    profile.avatar_url
  );
};

// When user joins a scheduled event:
// In the function that handles event registration/joining:

const joinEvent = async (event: ChannelEvent) => {
  if (!user || !profile) return;
  
  try {
    // Register for event
    await supabase.from('channel_event_registrations').insert({
      user_id: user.id,
      event_id: event.id,
      registered_at: new Date().toISOString()
    });
    
    // Post to community feed
    await handleAttendLiveEvent(
      event,
      event.channel?.name || 'Live Channel',
      user.id,
      profile.full_name || profile.email || 'Anonymous',
      profile.avatar_url
    );
    
    toast({ 
      title: 'Registered for Event!', 
      description: 'Your attendance has been shared with the community' 
    });
  } catch (error) {
    console.error('Error joining event:', error);
  }
};
*/

// ====== INTEGRATE INTO LiveChannelViewer COMPONENT ======

/*
// In LiveChannelViewer.tsx, when the component mounts and user starts watching:

useEffect(() => {
  if (channel && user && profile && !hasPostedJoin) {
    handleJoinLiveChannel(
      channel,
      user.id,
      profile.full_name || profile.email || 'Anonymous',
      profile.avatar_url
    );
    setHasPostedJoin(true);
  }
}, [channel, user, profile]);
*/

// =====================================================
// BOOK SUMMARIES INTEGRATION
// =====================================================

// ====== ADD THESE IMPORTS TO BookSummaries.tsx ======
/*
import { 
  postBookStarted,
  postBookCompleted
} from './communityActivityService';
*/

// ====== ADD THESE FUNCTIONS TO BookSummaries COMPONENT ======

/**
 * Post community activity when user starts reading a book
 */
const handleStartBook = async (
  book: BookSummary,
  userId: string,
  userName: string,
  userAvatar: string | undefined
) => {
  try {
    // Check if user already started this book
    const { data: existingProgress } = await supabase
      .from('user_book_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('book_id', book.id)
      .single();

    // Only post if this is the first time starting
    if (!existingProgress) {
      await postBookStarted(
        userId,
        userName,
        userAvatar,
        book.id,
        book.title,
        book.author
      );

      // Create progress record
      await supabase.from('user_book_progress').insert({
        user_id: userId,
        book_id: book.id,
        started_at: new Date().toISOString(),
        is_completed: false
      });
    }
  } catch (error) {
    console.error('Error posting book start:', error);
  }
};

/**
 * Post community activity when user completes a book
 */
const handleCompleteBook = async (
  book: BookSummary,
  userId: string,
  userName: string,
  userAvatar: string | undefined
) => {
  try {
    // Mark as completed in database
    await supabase.from('user_book_progress').upsert({
      user_id: userId,
      book_id: book.id,
      completed_at: new Date().toISOString(),
      is_completed: true
    });

    // Post to community feed
    await postBookCompleted(
      userId,
      userName,
      userAvatar,
      book.id,
      book.title,
      book.author
    );

    toast({ 
      title: 'Book Completed! 📚', 
      description: 'Your achievement has been shared with the community' 
    });
  } catch (error) {
    console.error('Error posting book completion:', error);
  }
};

// ====== USAGE IN BookSummaries COMPONENT ======

/*
// When user opens a book for the first time:

const openBook = async (book: BookSummary) => {
  if (!user || !profile) {
    toast({ 
      title: 'Sign in required', 
      description: 'Please sign in to read books' 
    });
    return;
  }

  setSelectedBook(book);
  
  // Post to community feed about starting the book
  await handleStartBook(
    book,
    user.id,
    profile.full_name || profile.email || 'Anonymous',
    profile.avatar_url
  );
};

// Add a "Mark as Complete" button in the book reader dialog:

<Dialog open={!!selectedBook} onOpenChange={(open) => !open && setSelectedBook(null)}>
  <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
    <DialogHeader>
      <DialogTitle>{selectedBook?.title}</DialogTitle>
    </DialogHeader>
    
    {/* Book content display *\/}
    
    <DialogFooter className="flex gap-2">
      <Button
        onClick={async () => {
          if (selectedBook && user && profile) {
            await handleCompleteBook(
              selectedBook,
              user.id,
              profile.full_name || profile.email || 'Anonymous',
              profile.avatar_url
            );
          }
        }}
        className="bg-green-600 hover:bg-green-700"
      >
        <CheckCircle className="h-4 w-4 mr-2" />
        Mark as Complete
      </Button>
      
      <Button variant="outline" onClick={() => setSelectedBook(null)}>
        Close
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
*/

// ====== ADD BOOK PROGRESS TRACKING TABLE ======
/*
If the user_book_progress table doesn't exist, create it with this schema:

CREATE TABLE user_book_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES book_summaries(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  is_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, book_id)
);

CREATE INDEX idx_user_book_progress_user ON user_book_progress(user_id);
CREATE INDEX idx_user_book_progress_book ON user_book_progress(book_id);
*/

export {
  handleJoinLiveChannel,
  handleAttendLiveEvent,
  handleStartBook,
  handleCompleteBook
};
