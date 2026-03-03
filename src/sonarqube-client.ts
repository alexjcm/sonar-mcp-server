/**
 * Lazy wrapper over Bun's native fetch for the SonarQube Web API.
 * It is instantiated only on first use — not at server startup.
 *
 * All APIs return application/json except api/system/ping (plain-text).
 * That is why there are two explicit methods, without Content-Type sniffing at runtime.
 */

import { config } from "./config.ts";

type Params = Record<string, string | number | boolean>;

class SonarqubeClient {
  private readonly baseUrl: string;
  private readonly headers: HeadersInit;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl;
    this.headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };
  }

  private buildUrl(path: string, params?: Params): string {
    const url = new URL(`${this.baseUrl}/${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  private async fetch(url: string): Promise<Response> {
    const response = await fetch(url, { method: "GET", headers: this.headers });
    if (!response.ok) {
      const body = await response.text().catch(() => "(no body)");
      throw new SonarqubeApiError(response.status, url, body);
    }
    return response;
  }

  /** GET → JSON. */
  async get<T = unknown>(path: string, params?: Params): Promise<T> {
    const response = await this.fetch(this.buildUrl(path, params));
    return response.json() as Promise<T>;
  }

  /** GET → plain text. Use exclusively for api/system/ping. */
  async getText(path: string, params?: Params): Promise<string> {
    const response = await this.fetch(this.buildUrl(path, params));
    return response.text();
  }
}

/** Structured error with HTTP code and URL for agent diagnostics */
export class SonarqubeApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    public readonly body: string
  ) {
    super(`SonarQube API error ${status} — ${url}`);
    this.name = "SonarqubeApiError";
  }
}

// Lazy singleton: instantiated on first use, not at process startup
let _client: SonarqubeClient | null = null;

export function getSonarqubeClient(): SonarqubeClient {
  if (!_client) {
    _client = new SonarqubeClient(config.sonarqubeUrl, config.sonarqubeToken);
  }
  return _client;
}
