export interface PublicUser {
  id: string;
  name: string;
  username: string;
}

export interface Profile {
  id: string;
  name: string;
  username: string;
  email?: string | null;
  isActive: boolean;
  lastLoginAt?: string | null;
  timestamp: string;
  updatedAt: string;
}

export type TripRole = 'owner' | 'member';

export interface TripMember {
  id: string;
  user: PublicUser;
  role: TripRole;
  joinedAt: string;
}

export interface Segment {
  id: string;
  tripId: string;
  city: string;
  country?: string | null;
  hotelName?: string | null;
  timezone: string;
  startDate: string;
  endDate: string;
  color?: string | null;
  lat?: number | null;
  lng?: number | null;
  locationLabel?: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface LatLng {
  lat: number;
  lng: number;
  label: string;
}

export interface Trip {
  id: string;
  name: string;
  description?: string | null;
  homeTimezone: string;
  baseCurrency: string;
  createdBy?: PublicUser | null;
  members: TripMember[];
  segments: Segment[];
  createdAt: string;
  updatedAt: string;
}

export interface TripSummary {
  id: string;
  name: string;
  description?: string | null;
  homeTimezone: string;
  baseCurrency: string;
  memberCount: number;
  members: TripMember[];
  segmentCount: number;
  startDate: string | null;
  endDate: string | null;
  updatedAt: string;
}

export interface CreateTripRequest {
  name: string;
  description?: string;
  homeTimezone: string;
  baseCurrency: string;
  memberUsernames?: string[];
}

export interface UpdateTripRequest {
  name?: string;
  description?: string;
  homeTimezone?: string;
  baseCurrency?: string;
}

export interface SegmentRequest {
  city: string;
  country?: string;
  hotelName?: string;
  timezone: string;
  startDate: string;
  endDate: string;
  color?: string;
  lat?: number | null;
  lng?: number | null;
  locationLabel?: string | null;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface TagRequest {
  name: string;
  color: string;
}

export interface Activity {
  id: string;
  tripId: string;
  segmentId: string | null;
  title: string;
  notes?: string | null;
  startAt: string;
  endAt: string;
  color?: string | null;
  lat?: number | null;
  lng?: number | null;
  locationLabel?: string | null;
  tags: Tag[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateActivityRequest {
  title: string;
  notes?: string;
  segmentId?: string | null;
  startAt: string;
  endAt: string;
  color?: string;
  lat?: number | null;
  lng?: number | null;
  locationLabel?: string | null;
  tagIds?: string[];
}

export type UpdateActivityRequest = Partial<CreateActivityRequest>;

export interface Expense {
  id: string;
  tripId: string;
  activityId: string | null;
  activityTitle: string | null;
  item: string;
  type: string;
  amountCents: number;
  chargeDate: string | null;
  paid: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExpenseRequest {
  item: string;
  type: string;
  amount: number;
  chargeDate?: string | null;
  paid?: boolean;
  activityId?: string | null;
}

export type UpdateExpenseRequest = Partial<CreateExpenseRequest>;

export interface PackingContainer {
  id: string;
  name: string;
  color: string;
  position: number;
}

export interface PackingItem {
  id: string;
  containerId: string | null;
  name: string;
  count: number;
  ready: boolean;
  packed: boolean;
  verify: boolean;
  position: number;
}

export interface PackingList {
  id: string;
  tripId: string;
  containers: PackingContainer[];
  items: PackingItem[];
}

export interface PackingTemplateSummary {
  id: string;
  name: string;
  containerCount: number;
  itemCount: number;
  createdAt: string;
}
