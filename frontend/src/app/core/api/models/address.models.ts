/** GET /api/addresses/ item */
export interface Address {
  id: number;
  city: number;
  title: string;
  address: string;
  latitude: string | null;    // decimal string from DRF
  longitude: string | null;
  is_default: boolean;
  created_at: string;
}

export interface AddressInput {
  city: number;
  title?: string;
  address: string;
  latitude?: number;
  longitude?: number;
  is_default?: boolean;
}
