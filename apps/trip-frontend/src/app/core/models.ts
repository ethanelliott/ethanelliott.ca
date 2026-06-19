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

// Trip-domain models will be filled in as the schedule + budget features land
// (step 2 onwards). Kept here so the API service has a shared home for them.
