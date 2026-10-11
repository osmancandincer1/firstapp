/**
 * Image moderation signals (APP.md §7.2). AWS: Rekognition moderation labels,
 * OCR lines and face age ranges. Mock: APP_ENV=local only (same switch as the
 * liveness mock, enforced in env.ts): one adult face, no labels, no text.
 *
 * Not covered yet: known-CSAM hash matching (PhotoDNA or similar), which needs
 * an application to the provider — TODO(owner), §7.7 / §13.1.
 */
import {
  DetectFacesCommand,
  DetectModerationLabelsCommand,
  DetectTextCommand,
  RekognitionClient,
} from '@aws-sdk/client-rekognition';
import type { ServerEnv } from '../env.ts';
import type { ImageModeration } from '../types.ts';
import type { RekognitionLike } from './faces.ts';

export class AwsImageModeration implements ImageModeration {
  constructor(private client: RekognitionLike) {}

  async analyze(image: Uint8Array) {
    const [labels, texts, faces] = await Promise.all([
      this.client.send(
        new DetectModerationLabelsCommand({ Image: { Bytes: image }, MinConfidence: 50 }),
      ),
      this.client.send(new DetectTextCommand({ Image: { Bytes: image } })),
      this.client.send(new DetectFacesCommand({ Image: { Bytes: image }, Attributes: ['ALL'] })),
    ]);
    return {
      labels: (labels.ModerationLabels ?? []).map((l: any) => ({
        name: String(l.Name ?? ''),
        parent: l.ParentName ? String(l.ParentName) : null,
        confidence: Number(l.Confidence ?? 0),
      })),
      texts: (texts.TextDetections ?? [])
        .filter((t: any) => t.Type === 'LINE' && t.DetectedText)
        .map((t: any) => String(t.DetectedText)),
      faces: (faces.FaceDetails ?? [])
        .filter((f: any) => f.AgeRange)
        .map((f: any) => ({ ageLow: Number(f.AgeRange.Low), ageHigh: Number(f.AgeRange.High) })),
    };
  }
}

export class MockImageModeration implements ImageModeration {
  analyze() {
    return Promise.resolve({ labels: [], texts: [], faces: [{ ageLow: 25, ageHigh: 32 }] });
  }
}

/** Uses the same AWS credentials as liveness; the mock follows the liveness mock (local only). */
export function imageModeration(env: ServerEnv): ImageModeration | null {
  if (!env.liveness) return null;
  if (env.liveness.provider === 'mock') return new MockImageModeration();
  return new AwsImageModeration(
    new RekognitionClient({
      region: env.liveness.region,
      credentials: {
        accessKeyId: env.liveness.accessKeyId,
        secretAccessKey: env.liveness.secretAccessKey,
      },
    }),
  );
}
