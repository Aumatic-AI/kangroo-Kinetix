export type StudioAspectRatio = "1:1" | "4:5" | "9:16" | "16:9";

export type StudioSessionStatus =
  | "collecting_brief"
  | "awaiting_answers"
  | "generating"
  | "reviewing"
  | "failed"
  | "finalized";

export interface StudioQuestion {
  id: number;
  question: string;
  options?: string[];
  placeholder?: string;
}

export interface StudioAnswer {
  id: number;
  question: string;
  answer: string;
}

export interface StudioSession {
  id: string;
  business_id: string;
  product_area: string;
  service: string | null;
  status: StudioSessionStatus;
  initial_idea: string;
  aspect_ratio: StudioAspectRatio;
  reference_image_url: string | null;
  qa_brief: StudioAnswer[];
  raw_image_url: string | null;
  creative_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudioImagePayload {
  imageUrl: string;
}

export interface StudioMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  kind: "text" | "questions" | "image";
  content: string | null;
  payload: { questions: StudioQuestion[] } | StudioImagePayload | null;
  created_at: string;
}
