/** Fields returned by `/api/users/resolve` and other public profile lookups. */
export const publicUserSelect = {
  address: true,
  username: true,
  avatarUrl: true,
  bio: true,
  twitter: true,
  discord: true,
  verified: true,
} as const;

export type PublicProfile = {
  address: string;
  username: string | null;
  avatarUrl: string | null;
  bio: string | null;
  twitter: string | null;
  discord: string | null;
  verified: boolean;
};
