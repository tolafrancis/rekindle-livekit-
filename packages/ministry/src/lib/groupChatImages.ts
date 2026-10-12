// Image messages for Small Group chat. Photos are resized on the device and
// stored twice in the private group-chat-media bucket — a small thumbnail
// for the chat and a larger copy for full screen — under
// <group_id>/<sender_id>/<client_id>-{thumb|full}.jpg (the storage policies
// in 0404 check both folders). They are shown through short-lived signed
// links, never public ones.

import { supabase } from '@rekindle/supabase';
import { CHAT_BUCKET } from './groupChatApi';

export const IMAGE_MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // before resizing
const FULL_MAX_SIDE = 1600;
const THUMB_MAX_SIDE = 480;
const SIGNED_URL_SECONDS = 60 * 60;

export interface PreparedImage {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That image couldn't be opened.")); };
    img.src = url;
  });
}

function resize(img: HTMLImageElement, maxSide: number, quality: number): Promise<{ blob: Blob; width: number; height: number }> {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error("That image couldn't be processed."));
  ctx.fillStyle = '#fff'; // flatten transparent PNGs onto white for JPEG
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve({ blob, width, height }) : reject(new Error("That image couldn't be processed."))),
      'image/jpeg',
      quality,
    );
  });
}

/** Validates and resizes a picked photo into the two stored sizes. */
export async function prepareChatImage(file: File): Promise<PreparedImage> {
  if (!/^image\/(jpeg|png|webp|heic|heif|gif)$/i.test(file.type) && !/\.(jpe?g|png|webp|heic|heif|gif)$/i.test(file.name)) {
    throw new Error('Please choose a photo (JPEG, PNG or WebP).');
  }
  if (file.size > IMAGE_MAX_UPLOAD_BYTES) {
    throw new Error('That photo is too large. Please choose one under 15 MB.');
  }
  const img = await loadImage(file);
  const [full, thumb] = await Promise.all([resize(img, FULL_MAX_SIDE, 0.82), resize(img, THUMB_MAX_SIDE, 0.75)]);
  return { full: full.blob, thumb: thumb.blob, width: full.width, height: full.height };
}

export const chatImagePrefix = (groupId: string, userId: string, clientId: string) =>
  `${groupId}/${userId}/${clientId}`;

/** Uploads both sizes. Re-uploading the same prefix (a retry) overwrites. */
export async function uploadChatImage(prefix: string, image: PreparedImage): Promise<void> {
  const bucket = supabase.storage.from(CHAT_BUCKET);
  const opts = { contentType: 'image/jpeg', upsert: true, cacheControl: '3600' };
  const [a, b] = await Promise.all([
    bucket.upload(`${prefix}-thumb.jpg`, image.thumb, opts),
    bucket.upload(`${prefix}-full.jpg`, image.full, opts),
  ]);
  if (a.error) throw a.error;
  if (b.error) throw b.error;
}

// Signed links are cached per page load and renewed before they expire.
const signedCache = new Map<string, { url: string; expires: number }>();

export async function signedChatImageUrl(prefix: string, size: 'thumb' | 'full'): Promise<string | null> {
  const path = `${prefix}-${size}.jpg`;
  const hit = signedCache.get(path);
  if (hit && hit.expires > Date.now() + 60_000) return hit.url;
  const { data, error } = await supabase.storage.from(CHAT_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) return null;
  signedCache.set(path, { url: data.signedUrl, expires: Date.now() + SIGNED_URL_SECONDS * 1000 });
  return data.signedUrl;
}
