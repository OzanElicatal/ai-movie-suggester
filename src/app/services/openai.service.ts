import { Injectable } from '@angular/core';
import { OpenAiMovieSuggestion } from '../models/movie';

export class OpenAiError extends Error {
  constructor(message: string, public readonly code?: string, public readonly status?: number) {
    super(message);
    this.name = 'OpenAiError';
  }
}

interface OpenAiResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type: string; text?: string }>;
    };
  }>;
}

@Injectable({ providedIn: 'root' })
export class OpenAiService {
  private readonly endpoint = 'https://api.openai.com/v1/chat/completions';
  private readonly model = 'gpt-4o-mini';

  async suggestMovies(
    prompt: string,
    apiKey: string,
    abortSignal?: AbortSignal
  ): Promise<OpenAiMovieSuggestion[]> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      signal: abortSignal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content:
              'You are MovieAI, an assistant that recommends films to match short briefs. Always respond using the supplied JSON schema and avoid commentary.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'movie_recommendations',
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['recommendations'],
              properties: {
                recommendations: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 5,
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['title'],
                    properties: {
                      title: { type: 'string' },
                      year: { type: 'integer', minimum: 1900, maximum: 2100 },
                      genres: {
                        type: 'array',
                        minItems: 1,
                        maxItems: 4,
                        items: { type: 'string' },
                      },
                      synopsis: { type: 'string' },
                      runtimeMinutes: { type: 'integer', minimum: 40, maximum: 240 },
                      whereToWatch: {
                        type: 'array',
                        minItems: 1,
                        maxItems: 3,
                        items: { type: 'string' },
                      },
                      watchReasons: {
                        type: 'array',
                        minItems: 1,
                        maxItems: 3,
                        items: { type: 'string' },
                      },
                      moodFit: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const details = await this.safeReadJson(response);
      const message =
        details?.error?.message ||
        (await this.safeReadText(response)) ||
        `OpenAI request failed with status ${response.status}.`;
      const code = details?.error?.code ?? details?.error?.type;
      throw new OpenAiError(message, code, response.status);
    }

    const data = (await response.json()) as OpenAiResponse;
    const content = data.choices?.[0]?.message?.content;
    const payload = this.extractJson(content ?? '');
    if (!payload?.recommendations || !Array.isArray(payload.recommendations)) {
      throw new OpenAiError('OpenAI returned an unexpected response format.');
    }

    return payload.recommendations.slice(0, 5);
  }

  private extractJson(
    content: string | Array<{ type: string; text?: string }>
  ): { recommendations?: OpenAiMovieSuggestion[] } | null {
    if (typeof content === 'string') {
      return this.tryParse(content);
    }

    const textChunk = content?.find((part) => part.type === 'text')?.text;
    if (textChunk) {
      return this.tryParse(textChunk);
    }

    return null;
  }

  private tryParse(payload: string): { recommendations?: OpenAiMovieSuggestion[] } | null {
    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
  }

  private async safeReadText(response: Response): Promise<string | null> {
    try {
      return await response.text();
    } catch {
      return null;
    }
  }

  private async safeReadJson(
    response: Response
  ): Promise<{ error?: { message?: string; code?: string; type?: string } } | null> {
    try {
      return (await response.clone().json()) as {
        error?: { message?: string; code?: string; type?: string };
      };
    } catch {
      return null;
    }
  }
}
