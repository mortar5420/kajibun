export type GoogleIdTokenClaims = {
  iss: string;
  aud: string;
  exp: number;
  nonce?: string;
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

export type GoogleJwk = JsonWebKey & {
  kid?: string;
};

export type SessionPayload = {
  sub: string;
  email: string;
  name?: string;
  exp: number;
};

export type CurrentUser = {
  id: number;
  googleSub: string;
  email: string;
  name?: string;
  pictureUrl?: string;
};

export type OidcConfig = {
  clientId: string;
  clientSecret: string;
  sessionSecret: string;
  allowedEmails: Set<string>;
};
