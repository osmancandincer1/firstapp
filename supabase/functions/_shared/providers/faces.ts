/**
 * Liveness and face collection adapters (APP.md §6.2, §13.1).
 *
 * AWS: Rekognition Face Liveness for the session, then SearchFacesByImage,
 * DetectFaces (age range) and IndexFaces on the reference frame.
 * Mock: APP_ENV=local only (enforced in env.ts); always "live", age 25–32,
 * no existing matches. It exists so the sign-up flow can run end to end in
 * development (§16.4 flow 1: "sahte canlılık sağlayıcısıyla").
 */
import {
  CreateFaceLivenessSessionCommand,
  DetectFacesCommand,
  GetFaceLivenessSessionResultsCommand,
  IndexFacesCommand,
  RekognitionClient,
  SearchFacesByImageCommand,
} from '@aws-sdk/client-rekognition';
import type { ServerEnv } from '../env.ts';
import type { FaceIndex, LivenessResult, LivenessService } from '../types.ts';

/** The subset of the AWS client we use, so tests can pass a fake. */
export interface RekognitionLike {
  send(command: unknown): Promise<any>;
}

export class AwsLiveness implements LivenessService, FaceIndex {
  readonly name = 'aws' as const;
  constructor(
    private client: RekognitionLike,
    private collectionId: string,
  ) {}

  async createSession(): Promise<string> {
    const out = await this.client.send(new CreateFaceLivenessSessionCommand({}));
    if (!out.SessionId) throw new Error('Rekognition returned no session id');
    return out.SessionId as string;
  }

  async getResult(sessionId: string): Promise<LivenessResult> {
    const out = await this.client.send(
      new GetFaceLivenessSessionResultsCommand({ SessionId: sessionId }),
    );
    if (out.Status !== 'SUCCEEDED') return { confidence: 0, referenceImage: null };
    return {
      confidence: typeof out.Confidence === 'number' ? out.Confidence : 0,
      referenceImage: out.ReferenceImage?.Bytes ?? null,
    };
  }

  async search(image: Uint8Array, threshold: number): Promise<string[]> {
    try {
      const out = await this.client.send(
        new SearchFacesByImageCommand({
          CollectionId: this.collectionId,
          Image: { Bytes: image },
          FaceMatchThreshold: threshold,
          MaxFaces: 10,
        }),
      );
      return (out.FaceMatches ?? []).map((m: any) => m.Face?.FaceId).filter(Boolean);
    } catch (err) {
      // No detectable face in the frame: nothing can match.
      if ((err as { name?: string }).name === 'InvalidParameterException') return [];
      throw err;
    }
  }

  async index(image: Uint8Array, externalId: string): Promise<string | null> {
    const out = await this.client.send(
      new IndexFacesCommand({
        CollectionId: this.collectionId,
        Image: { Bytes: image },
        ExternalImageId: externalId,
        MaxFaces: 1,
        QualityFilter: 'AUTO',
      }),
    );
    return out.FaceRecords?.[0]?.Face?.FaceId ?? null;
  }

  async ageLow(image: Uint8Array): Promise<{ low: number; high: number } | null> {
    const out = await this.client.send(
      new DetectFacesCommand({ Image: { Bytes: image }, Attributes: ['ALL'] }),
    );
    const range = out.FaceDetails?.[0]?.AgeRange;
    return range && typeof range.Low === 'number' && typeof range.High === 'number'
      ? { low: range.Low, high: range.High }
      : null;
  }
}

export class MockLiveness implements LivenessService, FaceIndex {
  readonly name = 'mock' as const;
  createSession(): Promise<string> {
    return Promise.resolve(`mock-${crypto.randomUUID()}`);
  }
  getResult(sessionId: string): Promise<LivenessResult> {
    return Promise.resolve({ confidence: 99, referenceImage: new TextEncoder().encode(sessionId) });
  }
  /** No duplicate faces locally; a profile photo is always the user's own face. */
  search(_image: Uint8Array, _threshold: number, ownPhotoOf?: string): Promise<string[]> {
    return Promise.resolve(ownPhotoOf ? [this.faceId(`u_${ownPhotoOf}`)] : []);
  }
  private faceId(externalId: string) {
    return `mock-face-${externalId}`;
  }
  index(_image: Uint8Array, externalId: string): Promise<string | null> {
    return Promise.resolve(this.faceId(externalId));
  }
  ageLow(): Promise<{ low: number; high: number } | null> {
    return Promise.resolve({ low: 25, high: 32 });
  }
}

export function livenessProviders(env: ServerEnv): {
  liveness: LivenessService | null;
  faces: FaceIndex | null;
} {
  if (!env.liveness) return { liveness: null, faces: null };
  if (env.liveness.provider === 'mock') {
    const m = new MockLiveness();
    return { liveness: m, faces: m };
  }
  const client = new RekognitionClient({
    region: env.liveness.region,
    credentials: {
      accessKeyId: env.liveness.accessKeyId,
      secretAccessKey: env.liveness.secretAccessKey,
    },
  });
  const aws = new AwsLiveness(client, env.liveness.collectionId);
  return { liveness: aws, faces: aws };
}
