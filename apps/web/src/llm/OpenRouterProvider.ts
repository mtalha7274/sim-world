import OpenAI from 'openai';
import type { LLMProvider, AgentDecisionRequest, AgentDecisionResponse } from './LLMProvider';
import { actionRegistry } from '../engine/ActionRegistry';

function toOpenAITool(def: { name: string; description: string; parameters: object }): OpenAI.ChatCompletionTool {
  return {
    type: 'function',
    function: {
      name: def.name,
      description: def.description,
      parameters: def.parameters as Record<string, unknown>,
    },
  };
}

export class OpenRouterProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey,
      dangerouslyAllowBrowser: true,
    });
    this.model = model;
  }

  async decide(request: AgentDecisionRequest): Promise<AgentDecisionResponse> {
    const allowed = request.allowedActions ?? actionRegistry.map(a => a.name);
    const tools = actionRegistry.filter(a => allowed.includes(a.name)).map(toOpenAITool);

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: request.systemPrompt },
      { role: 'user', content: request.worldSnapshot },
    ];

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      tools,
      tool_choice: 'auto',
    });

    const rawToolCall = response.choices[0]?.message?.tool_calls?.[0];
    if (!rawToolCall || rawToolCall.type !== 'function') {
      return { action: 'idle', params: {} };
    }

    const toolCall = rawToolCall as { type: 'function'; function: { name: string; arguments: string } };
    try {
      const params = JSON.parse(toolCall.function.arguments ?? '{}') as Record<string, unknown>;
      return { action: toolCall.function.name, params };
    } catch {
      return { action: 'idle', params: {} };
    }
  }
}

export async function testConnection(apiKey: string, model: string): Promise<void> {
  const client = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey,
    dangerouslyAllowBrowser: true,
  });
  await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: 'Say "ok".' }],
    max_tokens: 5,
  });
}
