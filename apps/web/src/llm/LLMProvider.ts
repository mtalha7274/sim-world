export interface VisibleEntity {
  id: string;
  name: string;
  position: { cellX: number; cellY: number };
  distance: number;
}

export interface AgentDecisionRequest {
  systemPrompt: string;
  worldSnapshot: string;
  visibleEntities: VisibleEntity[];
  memory: string[];
  allowedActions?: string[];
}

export interface AgentDecisionResponse {
  action: string;
  params: Record<string, unknown>;
}

export interface LLMProvider {
  decide(request: AgentDecisionRequest): Promise<AgentDecisionResponse>;
}
