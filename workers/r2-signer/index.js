import express from 'express';
import 'dotenv/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const app = express();
app.use(express.json());

const env = (n) => process.env[n] || '';
const R2_ENDPOINT = env('VIDEO_R2_ENDPOINT') || env('R2_ENDPOINT');
const R2_BUCKET = env('VIDEO_R2_BUCKET') || env('R2_BUCKET') || 'sermon-audio';

const s3 = new S3Client({
  region: env('R2_REGION') || 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: env('VIDEO_R2_ACCESS_KEY') || env('R2_ACCESS_KEY'),
    secretAccessKey: env('VIDEO_R2_SECRET_KEY') || env('R2_SECRET_KEY'),
  },
  forcePathStyle: false,
});

app.post('/signed-put', async (req, res) => {
  try {
    const { key, contentType } = req.body;
    if (!key) return res.status(400).json({ error: 'missing key' });

    const cmd = new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType || 'application/octet-stream' });
    const signedUrl = await getSignedUrl(s3, cmd, { expiresIn: 60 * 15 });
    const publicUrl = `${R2_ENDPOINT.replace(/\/$/, '')}/${R2_BUCKET}/${encodeURIComponent(key)}`;
    return res.json({ signedUrl, publicUrl });
  } catch (err) {
    console.error('signed-put error', err);
    return res.status(500).json({ error: String(err) });
  }
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log('r2-signer listening on', PORT));
