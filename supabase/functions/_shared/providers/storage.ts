/** Supabase Storage adapter (private buckets; service role only). */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Bucket, MediaStore } from '../types.ts';

export class SupabaseMediaStore implements MediaStore {
  constructor(private c: SupabaseClient) {}

  async signedUploadUrl(bucket: Bucket, path: string) {
    const { data, error } = await this.c.storage.from(bucket).createSignedUploadUrl(path);
    if (error || !data) throw new Error(`signed upload URL failed: ${error?.message}`);
    return { path: data.path, token: data.token };
  }

  async download(bucket: Bucket, path: string) {
    const { data, error } = await this.c.storage.from(bucket).download(path);
    if (error || !data) return null;
    return new Uint8Array(await data.arrayBuffer());
  }

  async upload(bucket: Bucket, path: string, bytes: Uint8Array, contentType: string) {
    const { error } = await this.c.storage
      .from(bucket)
      .upload(path, bytes, { contentType, upsert: true });
    if (error) throw new Error(`upload failed: ${error.message}`);
  }

  async remove(bucket: Bucket, paths: string[]) {
    if (paths.length === 0) return;
    const { error } = await this.c.storage.from(bucket).remove(paths);
    if (error) throw new Error(`remove failed: ${error.message}`);
  }

  async signedUrl(bucket: Bucket, path: string, expiresInSeconds: number) {
    const { data, error } = await this.c.storage
      .from(bucket)
      .createSignedUrl(path, expiresInSeconds);
    return error || !data ? null : data.signedUrl;
  }

  async signedUrls(bucket: Bucket, paths: string[], expiresInSeconds: number) {
    if (paths.length === 0) return {};
    const { data, error } = await this.c.storage
      .from(bucket)
      .createSignedUrls(paths, expiresInSeconds);
    if (error || !data) return {};
    return Object.fromEntries(
      data
        .filter((d) => d.signedUrl && d.path)
        .map((d) => [d.path as string, d.signedUrl as string]),
    );
  }
}
