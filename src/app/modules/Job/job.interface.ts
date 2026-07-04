export type TCreateJob = {
  title: string;
  description: string;
  budget: number;
  is_negotiable?: boolean;
  is_urgent?: boolean;
  scheduled_at: string | Date;
  latitude: number;
  longitude: number;
  address: string;
};

export type TUpdateJob = Partial<TCreateJob>;

// Query param types — all values from req.query are strings
export type TJobListQuery = {
  searchTerm?: string;
  page?: string;
  limit?: string;
};

export type TBrowseJobsQuery = TJobListQuery & {
  lat?: string;
  lng?: string;
  radius?: string;
};

// Shape returned by the spatial $queryRaw (only used to extract id + distance)
export type TRawJobRow = {
  id: string;
  distance: number;
};

// Shape returned by the count $queryRaw
export type TRawCountRow = {
  count: number;
};

// Minimal public user fields selected in job queries (customer or helper)
export type TUserPublicFields = {
  id: string;
  name: string;
  avatar: string | null;
  rating_average: number;
  total_reviews: number;
  completed_jobs: number;
  verification_status: string;
};

// Minimal shape of a job's selected_application as included in queries
export type TSelectedApplicationRef = {
  id: string;
  helper_id: string;
} | null;

// Minimal job shape needed by the mask utilities
export type TJobMaskInput = {
  customer_id: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  customer?: TUserPublicFields | null;
  selected_application?: TSelectedApplicationRef;
  [key: string]: unknown; // allow passthrough of all other prisma fields
};
