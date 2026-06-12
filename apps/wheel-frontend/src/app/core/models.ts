export interface Profile {
  id: string;
  name: string;
  isActive: boolean;
  lastLoginAt?: string | null;
  timestamp: string;
  updatedAt: string;
}

export interface WheelTag {
  name: string;
  color: string;
}

export interface WheelItem {
  label: string;
  tags: string[];
}

export interface Wheel {
  id: string;
  name: string;
  tags: WheelTag[];
  items: WheelItem[];
  createdAt: string;
  updatedAt: string;
}

export interface WheelSummary {
  id: string;
  name: string;
  itemCount: number;
  tagCount: number;
  updatedAt: string;
}

export interface SaveWheelRequest {
  name: string;
  tags: WheelTag[];
  items: WheelItem[];
}
