export type TakeScope = "card" | "player" | "portfolio";

export interface TakeInputs {
  signalCount: number;
  confidenceScore?: number;
  narrativeTags: string[];

  sport?: string;
  position?: string;
  age?: number;
  isRookie?: boolean;
  seasonPhase?: "IN_SEASON" | "OFFSEASON" | "PRESEASON" | "PLAYOFFS";
  careerStage?: string;
  action?: string;
  roleTier?: string;
}

export interface TakeSubject {
  playerName?: string;
  cardName?: string;
  subjectId?: string;
  portfolioId?: string;
}

export interface GenerateTakesRequest {
  scope: TakeScope;
  subject: TakeSubject;
  inputs: TakeInputs;

  portfolioContext?: {
    concentrationPctTop1?: number;
    topExposureLabel?: string;
    segmentMomentum?: "UP" | "FLAT" | "DOWN";
  };
}

export interface Take {
  id: string;
  scope: TakeScope;
  severity: "SOFT" | "STRONG";
  type: "STRUCTURAL" | "TIMING" | "CAUTION";
  trigger: string;
  confidence: number;
  text: string;
}
