// Radtyper för canvas-schemat (läses via publika cv_*-vyerna).

export type ProjectStatus = "draft" | "active" | "delivered" | "archived";
export type ShotStatus = "idea" | "ready" | "queued" | "generated" | "curated" | "locked";
export type VariantStatus = "new" | "kept" | "rejected";
export type BatchStatus = "pending_approval" | "approved" | "running" | "done" | "cancelled";
export type BatchItemStatus =
  | "queued"
  | "running"
  | "dispatched"
  | "succeeded"
  | "failed"
  | "skipped";
export type SoulKind = "character" | "place" | "prop" | "style";
export type RefRole = "identitet" | "stil" | "struktur" | "kontinuitet";

export interface Project {
  id: string;
  title: string;
  client_id: string | null;
  content_plan_id: string | null;
  content_item_id: string | null;
  format: string;
  status: ProjectStatus;
  brief: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Scene {
  id: string;
  project_id: string;
  title: string;
  beat: string | null;
  position: number;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Shot {
  id: string;
  project_id: string;
  scene_id: string;
  position: number;
  title: string;
  description: string;
  camera: string;
  light: string;
  motion: string;
  duration: number;
  status: ShotStatus;
  camera_presets: string[];
  content_item_id: string | null;
  selected_variant_id: string | null;
  current_prompt_version_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Variant {
  id: string;
  project_id: string;
  shot_id: string | null;
  source: string;
  status: VariantStatus;
  media_url: string;
  media_type: string;
  prompt: string | null;
  engine: string | null;
  batch_item_id: string | null;
  comment: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Soul {
  id: string;
  key: string;
  kind: SoulKind;
  name: string;
  description: string;
  prompt_fragment: string;
  negative_fragment: string;
  ref_urls: string[];
  client_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ShotSoul {
  shot_id: string;
  soul_id: string;
  role: string;
  position: number;
}

// Referens-slot (Popcorn-mönstret): typad bildreferens in i kedjan, max 4 per shot.
export interface ShotRef {
  shot_id: string;
  slot: number;
  project_id: string;
  role: RefRole;
  media_url: string;
  variant_id: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface EngineCost {
  engine: string;
  cost_units: number;
  note: string | null;
  updated_at: string;
}

// Studio-kopplingen: smala läsvyer över leverans/studio (cv_clients m.fl.) —
// canvasen föder projekt ur riktiga klienter/planer/items, inga parallellstrukturer.
export interface StudioClient {
  id: string;
  name: string;
}

export interface StudioContentPlan {
  id: string;
  client_id: string;
  campaign_name: string | null;
  month: string | null;
  status: string;
}

export interface StudioContentItem {
  id: string;
  client_id: string;
  content_plan_id: string | null;
  platform: string | null;
  content_type: string | null;
  title: string | null;
  status: string;
  hook: string | null;
  caption: string | null;
}

export interface ChainStep {
  op: string;
  params: string;
}

export interface PromptVersion {
  id: string;
  shot_id: string;
  version: number;
  chain: ChainStep[];
  compiled: string;
  engine_hint: string | null;
  note: string | null;
  created_by: string;
  created_at: string;
}

export interface Batch {
  id: string;
  project_id: string;
  status: BatchStatus;
  engine: string;
  cap_max_jobs: number;
  cap_max_cost: number | null;
  approved_by: string | null;
  approved_at: string | null;
  note: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface BatchItem {
  id: string;
  batch_id: string;
  shot_id: string;
  prompt_version_id: string | null;
  status: BatchItemStatus;
  engine: string | null;
  result_variant_id: string | null;
  error: string | null;
  cost_units: number;
  external_job_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}
