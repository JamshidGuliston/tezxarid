export interface TokenPair { access: string; refresh: string; }

/** GET /api/auth/me/ */
export interface Me {
  id: number;
  telegram_id: number | null;
  first_name: string;
  last_name: string;
  phone: string;             // '+998XXXXXXXXX' or ''
  city: number | null;
  date_joined: string;       // ISO datetime with +05:00 offset
}
export type MePatch = Partial<Pick<Me, 'first_name' | 'last_name' | 'phone' | 'city'>>;
