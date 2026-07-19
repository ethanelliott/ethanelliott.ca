export interface Profile {
  id: string;
  name: string;
  username: string | null;
  isActive: boolean;
  lastLoginAt?: string | null;
  timestamp: string;
  updatedAt: string;
}

export interface PublicUser {
  id: string;
  username: string | null;
  name: string;
}

export type WheelRole = 'owner' | 'editor';

export interface WheelTag {
  name: string;
  color: string;
}

export interface WheelItem {
  label: string;
  tags: string[];
  /** Disabled ("archived") items stay in the list but sit out of spins. */
  enabled: boolean;
}

export interface Wheel {
  id: string;
  name: string;
  tags: WheelTag[];
  items: WheelItem[];
  owner: PublicUser;
  role: WheelRole;
  sharedWith: PublicUser[];
  createdAt: string;
  updatedAt: string;
}

export interface WheelSummary {
  id: string;
  name: string;
  itemCount: number;
  tagCount: number;
  role: WheelRole;
  owner: PublicUser;
  sharedCount: number;
  updatedAt: string;
}

export interface SaveWheelRequest {
  name: string;
  tags: WheelTag[];
  items: WheelItem[];
}
