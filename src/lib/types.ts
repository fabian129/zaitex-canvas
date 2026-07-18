// Radtyper för canvas-schemat (läses via publika cv_*-vyerna).

export type ProjectStatus = "draft" | "active" | "delivered" | "archived";
export type ShotStatus = "idea" | "ready" | "queued" | "generated" | "curated" | "locked";
export type VariantStatus = "new" | "kept" | "rejected";
export type BatchStatus = "pending_approval" | "approved" | "running" | "done" | "cancelled";
export type BatchItemStatus = "queued" | "running" | "succeeded" | "failed" | "skipped";
export type SoulKind = "character" | "place" | "prop" | "style";

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
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}
