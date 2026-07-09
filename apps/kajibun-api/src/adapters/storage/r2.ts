export interface ObjectStorage {
  get(key: string): Promise<StoredObject | null>;
  put(input: StoreObjectInput): Promise<void>;
  delete(key: string): Promise<void>;
}

export type StoreObjectInput = {
  key: string;
  body: ArrayBuffer;
  contentType: string;
  cacheControl: string;
};

export type StoredObject = {
  body: ReadableStream;
  contentType: string | null;
  cacheControl: string | null;
  etag: string;
};

export function createR2ObjectStorage(bucket: R2Bucket): ObjectStorage {
  return {
    async get(key): Promise<StoredObject | null> {
      const object = await bucket.get(key);
      if (!object) {
        return null;
      }

      return {
        body: object.body,
        contentType: object.httpMetadata?.contentType ?? null,
        cacheControl: object.httpMetadata?.cacheControl ?? null,
        etag: object.httpEtag,
      };
    },

    async put(input): Promise<void> {
      await bucket.put(input.key, input.body, {
        httpMetadata: {
          contentType: input.contentType,
          cacheControl: input.cacheControl,
        },
      });
    },

    async delete(key): Promise<void> {
      await bucket.delete(key);
    },
  };
}
