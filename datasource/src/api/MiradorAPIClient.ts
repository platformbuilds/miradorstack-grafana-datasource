import { getBackendSrv } from '@grafana/runtime';
import { lastValueFrom } from 'rxjs';

export class MiradorAPIError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'MiradorAPIError';
  }
}

export class MiradorAPIClient {
  constructor(
    private baseUrl: string,
    private token?: string,
    private tenantId?: string
  ) {}

  private async request(
    endpoint: string,
    method: string = 'get',
    params?: Record<string, any>,
    body?: any
  ): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    if (this.tenantId) {
      headers['X-Tenant-ID'] = this.tenantId;
    }

    const response = getBackendSrv().fetch({
      url,
      method: method as string,
      headers,
      params,
      data: body,
    });

    try {
      const result = await lastValueFrom(response);
      return result;
    } catch (error: any) {
      throw new MiradorAPIError(error.message || 'API request failed', error.status);
    }
  }

  async health(): Promise<{ status: number; data: { service: string; status: string; timestamp: string; version: string }; statusText?: string }> {
    return this.request('/health');
  }

  async logs(query: { query: string; start?: number; end?: number; limit?: number; search_engine?: 'lucene' | 'bleve' }): Promise<any> {
    const body = {
      query: query.query,
      start: query.start,
      end: query.end,
      limit: query.limit || 1000,
      search_engine: query.search_engine || 'bleve', // Default to bleve as preferred
    };
    return this.request('/logs/query', 'post', undefined, body);
  }

  async metrics(query: { query: string; start?: number; end?: number }): Promise<any> {
    return this.request('/metrics', 'get', query);
  }

  async traces(query: { query: string; start?: number; end?: number }): Promise<any> {
    return this.request('/traces', 'get', query);
  }

  async logFields(): Promise<any> {
    return this.request('/logs/fields', 'get');
  }

  // Add more methods as needed
}