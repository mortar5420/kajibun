import { httpError } from "../shared/errors";
import type { ObjectStorage } from "../adapters/storage/r2";
import type { CurrentUser } from "./types";
import type { UserRecord } from "./repository";

const MAX_AVATAR_BYTES = 1024 * 1024;
const AVATAR_CACHE_CONTROL = "public, max-age=31536000, immutable";

const avatarTypes = {
  "image/jpeg": {
    extension: "jpg",
    matches: (bytes: Uint8Array) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  },
  "image/png": {
    extension: "png",
    matches: (bytes: Uint8Array) =>
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a,
  },
  "image/webp": {
    extension: "webp",
    matches: (bytes: Uint8Array) =>
      bytes.length >= 12 &&
      ascii(bytes.slice(0, 4)) === "RIFF" &&
      ascii(bytes.slice(8, 12)) === "WEBP",
  },
} as const;

export type AvatarUpload = {
  objectKey: string;
  contentType: string;
  previousObjectKey: string | null;
};

export async function parseAvatarUpload(formData: FormData, actor: CurrentUser): Promise<AvatarUpload & { body: ArrayBuffer }> {
  const file = formData.get("avatar");
  if (!(file instanceof File)) {
    throw httpError("missing_avatar", "avatar file is required", 400);
  }
  if (file.size <= 0) {
    throw httpError("invalid_avatar", "avatar file is empty", 400);
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw httpError("avatar_too_large", "avatar file must be 1MB or smaller", 413);
  }

  const avatarType = avatarTypes[file.type as keyof typeof avatarTypes];
  if (!avatarType) {
    throw httpError("unsupported_avatar_type", "avatar must be JPEG, PNG, or WebP", 415);
  }

  const body = await file.arrayBuffer();
  if (!avatarType.matches(new Uint8Array(body))) {
    throw httpError("invalid_avatar", "avatar file content does not match its type", 400);
  }

  return {
    objectKey: `users/${actor.id}/avatar-${Date.now()}.${avatarType.extension}`,
    contentType: file.type,
    previousObjectKey: null,
    body,
  };
}

export async function storeAvatar(
  storage: ObjectStorage,
  input: AvatarUpload & { body: ArrayBuffer },
): Promise<void> {
  await storage.put({
    key: input.objectKey,
    body: input.body,
    contentType: input.contentType,
    cacheControl: AVATAR_CACHE_CONTROL,
  });
}

export async function avatarResponse(storage: ObjectStorage, user: UserRecord): Promise<Response> {
  if (!user.avatar_object_key) {
    return new Response(null, { status: 404 });
  }

  const object = await storage.get(user.avatar_object_key);
  if (!object) {
    return new Response(null, { status: 404 });
  }

  return new Response(object.body, {
    headers: {
      "Content-Type": object.contentType ?? user.avatar_content_type ?? "application/octet-stream",
      "Cache-Control": object.cacheControl ?? AVATAR_CACHE_CONTROL,
      ETag: object.etag,
    },
  });
}

export function getUserPictureUrl(user: Pick<UserRecord, "id" | "picture_url" | "avatar_object_key" | "avatar_updated_at">): string | undefined {
  if (user.avatar_object_key) {
    const updated = user.avatar_updated_at ? `?updated=${encodeURIComponent(user.avatar_updated_at)}` : "";
    return `/api/users/${user.id}/avatar${updated}`;
  }

  return user.picture_url ?? undefined;
}

function ascii(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes);
}
