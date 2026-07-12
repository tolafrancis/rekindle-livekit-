// src/lib/musicStorage.ts
// Utility functions for music file uploads and storage management

import { supabase } from '@rekindle/supabase';

// Allowed audio MIME types
const ALLOWED_AUDIO_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'audio/aac',
  'audio/m4a',
  'audio/x-m4a',
  'audio/webm',
  'audio/flac'
];
// Maximum file size (50MB)
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// Storage bucket name
const BUCKET_NAME = 'background-music';
const MUSIC_FOLDER = 'background-music/music';

export interface UploadResult {
  success: boolean;
  publicUrl?: string;
  fileName?: string;
  error?: string;
}

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  file_url: string;
  category: string;
  cover_image_url?: string;
  duration_seconds?: number;
  is_published?: boolean;
  is_public?: boolean;
  uploaded_by?: string;
  created_at?: string;
}

/**
 * Generate a unique filename for uploaded audio files
 */
export const generateUniqueFilename = (originalName: string): string => {
  // Extract extension
  const extension = originalName.split('.').pop()?.toLowerCase() || 'mp3';
  
  // Generate UUID-like unique identifier
  const timestamp = Date.now();
  const randomPart = Math.random().toString(36).substring(2, 15);
  const uniqueId = `${timestamp}-${randomPart}`;
  
  // Sanitize original filename (remove special chars, spaces)
  const sanitizedName = originalName
    .replace(/\.[^/.]+$/, '') // Remove extension
    .replace(/[^a-zA-Z0-9]/g, '_') // Replace special chars with underscore
    .substring(0, 50); // Limit length
  
  return `${sanitizedName}_${uniqueId}.${extension}`;
};
/**
 * Validate audio file before upload
 */
export const validateAudioFile = (file: File): { valid: boolean; error?: string } => {
  // Check file type
  if (!ALLOWED_AUDIO_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `Invalid file type. Allowed types: MP3, WAV, OGG, AAC, M4A, WebM, FLAC`
    };
  }
  
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`
    };
  }
  
  return { valid: true };
};

/**
 * Upload audio file to Supabase storage
 */
export const uploadAudioFile = async (file: File): Promise<UploadResult> => {
  // Validate file
  const validation = validateAudioFile(file);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }
  
  // Generate unique filename
  const uniqueFilename = generateUniqueFilename(file.name);
  const filePath = `${MUSIC_FOLDER}/${uniqueFilename}`;
  
  try {
    // Upload to storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });
    
    if (uploadError) {
      console.error('Upload error:', uploadError);
      return { success: false, error: uploadError.message };
    }
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);
    
    if (!urlData?.publicUrl) {
      return { success: false, error: 'Failed to get public URL' };
    }
    
    return {
      success: true,
      publicUrl: urlData.publicUrl,
      fileName: uniqueFilename
    };
  } catch (error: any) {
    console.error('Upload exception:', error);
    return { success: false, error: error.message || 'Upload failed' };
  }
};

/**
 * Save music track metadata to database
 */
export const saveMusicTrack = async (
  track: Omit<MusicTrack, 'id' | 'created_at'>
): Promise<{ success: boolean; data?: MusicTrack; error?: string }> => {
  try {
    const { data, error } = await supabase
      .from('background_music')
      .insert({
        title: track.title,
        name: track.title, // For backwards compatibility
        artist: track.artist || 'Unknown Artist',
        file_url: track.file_url,
        category: track.category || 'instrumental',
        cover_image_url: track.cover_image_url || null,
        duration_seconds: track.duration_seconds || null,
        is_published: track.is_published ?? true,
        is_public: track.is_public ?? true,
        uploaded_by: track.uploaded_by || null,
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) {
      console.error('Save track error:', error);
      return { success: false, error: error.message };
    }
    
    return { success: true, data };
  } catch (error: any) {
    console.error('Save track exception:', error);
    return { success: false, error: error.message || 'Failed to save track' };
  }
};

/**
 * Upload audio file and save metadata in one operation
 */
export const uploadAndSaveTrack = async (
  file: File,
  metadata: {
    title?: string;
    artist?: string;
    category?: string;
    is_published?: boolean;
    is_public?: boolean;
    uploaded_by?: string;
  } = {}
): Promise<{ success: boolean; track?: MusicTrack; error?: string }> => {
  // Upload file
  const uploadResult = await uploadAudioFile(file);
  if (!uploadResult.success || !uploadResult.publicUrl) {
    return { success: false, error: uploadResult.error };
  }
  
  // Extract title from filename if not provided
  const title = metadata.title || file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');
  
  // Save metadata
  const saveResult = await saveMusicTrack({
    title,
    artist: metadata.artist || 'My Upload',
    file_url: uploadResult.publicUrl,
    category: metadata.category || 'personal',
    is_published: metadata.is_published ?? true,
    is_public: metadata.is_public ?? true,
    uploaded_by: metadata.uploaded_by
  });
  
  if (!saveResult.success) {
    return { success: false, error: saveResult.error };
  }
  
  return { success: true, track: saveResult.data };
};

/**
 * Fetch all music tracks from database
 */
export const fetchMusicTracks = async (options: {
  publishedOnly?: boolean;
  category?: string;
  limit?: number;
} = {}): Promise<{ success: boolean; tracks: MusicTrack[]; error?: string }> => {
  try {
    let query = supabase
      .from('background_music')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (options.publishedOnly) {
      query = query.eq('is_published', true);
    }
    
    if (options.category && options.category !== 'all') {
      query = query.eq('category', options.category);
    }
    
    if (options.limit) {
      query = query.limit(options.limit);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Fetch tracks error:', error);
      return { success: false, tracks: [], error: error.message };
    }
    
    return { success: true, tracks: data || [] };
  } catch (error: any) {
    console.error('Fetch tracks exception:', error);
    return { success: false, tracks: [], error: error.message || 'Failed to fetch tracks' };
  }
};

/**
 * Get a single track by ID
 */
export const getTrackById = async (id: string): Promise<{ success: boolean; track?: MusicTrack; error?: string }> => {
  try {
    const { data, error } = await supabase
      .from('background_music')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      return { success: false, error: error.message };
    }
    
    return { success: true, track: data };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to get track' };
  }
};

/**
 * Delete a music track
 */
export const deleteTrack = async (id: string, fileUrl?: string): Promise<{ success: boolean; error?: string }> => {
  try {
    // Delete from database
    const { error: dbError } = await supabase
      .from('background_music')
      .delete()
      .eq('id', id);
    
    if (dbError) {
      return { success: false, error: dbError.message };
    }
    
    // Try to delete from storage if URL provided
    if (fileUrl) {
      try {
        // Extract path from URL
        const urlParts = fileUrl.split(`${BUCKET_NAME}/`);
        if (urlParts.length > 1) {
          const filePath = urlParts[1];
          await supabase.storage.from(BUCKET_NAME).remove([filePath]);
        }
      } catch (storageError) {
        console.warn('Could not delete file from storage:', storageError);
        // Don't fail the operation if storage delete fails
      }
    }
    
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to delete track' };
  }
};

/**
 * List all files in the music folder (for admin purposes)
 */
export const listStorageFiles = async (): Promise<{ success: boolean; files: any[]; error?: string }> => {
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .list(MUSIC_FOLDER, {
        limit: 100,
        sortBy: { column: 'created_at', order: 'desc' }
      });
    
    if (error) {
      return { success: false, files: [], error: error.message };
    }
    
    return { success: true, files: data || [] };
  } catch (error: any) {
    return { success: false, files: [], error: error.message || 'Failed to list files' };
  }
};

export default {
  uploadAudioFile,
  saveMusicTrack,
  uploadAndSaveTrack,
  fetchMusicTracks,
  getTrackById,
  deleteTrack,
  validateAudioFile,
  generateUniqueFilename,
  listStorageFiles
};
