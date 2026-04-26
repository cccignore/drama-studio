export type BatchMarket = "domestic" | "overseas";
export type BatchStage = "sources" | "creative" | "screenplay" | "storyboard";
export type BatchReviewStage = "sources" | "creative" | "screenplay";
export type BatchItemStatus =
  | "source_ready"
  | "creative_running"
  | "creative_ready"
  | "screenplay_running"
  | "screenplay_ready"
  | "storyboard_running"
  | "storyboard_ready"
  | "failed";

export interface BatchProject {
  id: string;
  title: string;
  sourceText: string;
  targetMarket: BatchMarket;
  totalEpisodes: number;
  status: string;
  useComplexReversal: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface BatchItem {
  id: string;
  batchId: string;
  sourceTitle: string;
  sourceKeywords: string;
  sourceSummary: string;
  sourceText: string;
  title: string;
  oneLiner: string;
  creativeMd: string;
  screenplayMd: string;
  storyboardMd: string;
  ideaSelected: boolean;
  creativeSelected: boolean;
  screenplaySelected: boolean;
  status: BatchItemStatus;
  error: string;
  meta: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
}

export interface ParsedSourceDrama {
  sourceTitle: string;
  sourceKeywords: string;
  sourceSummary: string;
  sourceText: string;
}
