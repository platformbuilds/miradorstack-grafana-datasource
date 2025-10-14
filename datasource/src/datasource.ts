import {
  CoreApp,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceApi,
  DataSourceInstanceSettings,
  createDataFrame,
  FieldType,
} from '@grafana/data';

import { MyQuery, MyDataSourceOptions, LogEntry } from './types';
import { MiradorAPIClient } from './api/MiradorAPIClient';

export class DataSource extends DataSourceApi<MyQuery, MyDataSourceOptions> {
  baseUrl: string;
  private client: MiradorAPIClient;

  constructor(instanceSettings: DataSourceInstanceSettings<MyDataSourceOptions>) {
    super(instanceSettings);
    this.baseUrl = instanceSettings.url!;
    this.client = new MiradorAPIClient(
      this.baseUrl,
      undefined, // Let Grafana's backend proxy handle authentication
      instanceSettings.jsonData.tenantId
    );
  }

  getDefaultQuery(_: CoreApp): Partial<MyQuery> {
    return {
      queryType: 'logs',
      queryText: '',
      queryEngine: 'bleve',
    };
  }

  filterQuery(query: MyQuery): boolean {
    // if no query has been provided, prevent the query from being executed
    return !!query.queryText;
  }

  async query(options: DataQueryRequest<MyQuery>): Promise<DataQueryResponse> {
    const { range } = options;
    const from = range!.from.valueOf();
    const to = range!.to.valueOf();

    const data = await Promise.all(
      options.targets.map(async (target) => {
        try {
          switch (target.queryType) {
            case 'logs':
              const logsResponse = await this.client.logs({
                query: target.queryText || '',
                start: from,
                end: to,
                limit: 1000,
                search_engine: target.queryEngine || 'bleve'
              });
              return this.parseLogsResponse(logsResponse, target.refId);
            case 'metrics':
              await this.client.metrics({ query: target.queryText || '', start: from, end: to });
              // Placeholder for metrics
              return createDataFrame({
                refId: target.refId,
                fields: [
                  { name: 'Time', values: [from, to], type: FieldType.time },
                  { name: 'Value', values: [Math.random() * 100, Math.random() * 100], type: FieldType.number },
                ],
              });
            case 'traces':
              await this.client.traces({ query: target.queryText || '', start: from, end: to });
              // Placeholder for traces
              return createDataFrame({
                refId: target.refId,
                fields: [
                  { name: 'Time', values: [from, to], type: FieldType.time },
                  { name: 'Value', values: [Math.random() * 100, Math.random() * 100], type: FieldType.number },
                ],
              });
            default:
              return createDataFrame({
                refId: target.refId,
                fields: [
                  { name: 'Time', values: [from, to], type: FieldType.time },
                  { name: 'Value', values: [0, 0], type: FieldType.number },
                ],
              });
          }
        } catch (error) {
          console.error('Query error:', error);
          return createDataFrame({
            refId: target.refId,
            fields: [
              { name: 'Time', values: [from, to], type: FieldType.time },
              { name: 'Value', values: [0, 0], type: FieldType.number },
            ],
          });
        }
      })
    );

    return { data };
  }

  private parseLogsResponse(response: any, refId: string) {
    // Handle Grafana's backend proxy wrapping
    const apiResponse = response?.data || response;

    // Extract log entries from the response
    let logEntries: LogEntry[] = [];

    if (apiResponse.data?.logs && Array.isArray(apiResponse.data.logs)) {
      // Mirador Core format with data.logs
      logEntries = apiResponse.data.logs;
    } else if (apiResponse.logs && Array.isArray(apiResponse.logs)) {
      // Alternative: logs directly under response
      logEntries = apiResponse.logs;
    } else if (Array.isArray(apiResponse.data)) {
      // Direct array format
      logEntries = apiResponse.data;
    } else if (apiResponse.data?.result && Array.isArray(apiResponse.data.result)) {
      // VictoriaLogs format with data.result
      logEntries = apiResponse.data.result;
    } else if (apiResponse.result && Array.isArray(apiResponse.result)) {
      // Alternative format
      logEntries = apiResponse.result;
    }

    if (logEntries.length === 0) {
      // Return empty DataFrame if no logs
      return createDataFrame({
        refId,
        fields: [
          { name: 'timestamp', type: FieldType.time, values: [] },
          { name: 'body', type: FieldType.string, values: [] },
          { name: 'severity', type: FieldType.string, values: [] },
        ],
      });
    }

    // Transform log entries to Grafana format
    const times: number[] = [];
    const messages: string[] = [];
    const levels: string[] = [];
    const labels: Record<string, string[]> = {};

    logEntries.forEach((entry) => {
      // Parse timestamp - Mirador Core uses _time field
      const timestamp = entry._time ? new Date(entry._time).getTime() : Date.now();
      times.push(timestamp);

      // Message field - Mirador Core uses _msg
      const message = entry._msg || entry.message || JSON.stringify(entry);
      messages.push(message);

      // Level field - Mirador Core uses severity
      const level = entry.severity || entry.level || 'unknown';
      levels.push(level);

      // Collect additional fields as labels
      Object.keys(entry).forEach((key) => {
        if (!['_time', '_msg', 'message', 'level', 'severity', '_stream', '_stream_id'].includes(key)) {
          if (!labels[key]) {
            labels[key] = [];
          }
          labels[key].push(String(entry[key]));
        }
      });
    });

    // Create fields array with Grafana-expected names
    const fields = [
      { name: 'timestamp', type: FieldType.time, values: times },
      { name: 'body', type: FieldType.string, values: messages },
      { name: 'severity', type: FieldType.string, values: levels },
    ];

    // Add label fields
    Object.keys(labels).forEach((labelKey) => {
      fields.push({
        name: labelKey,
        type: FieldType.string,
        values: labels[labelKey],
      });
    });

    return createDataFrame({
      refId,
      fields,
    });
  }

  async testDatasource() {
    const defaultErrorMessage = 'Cannot connect to API';

    try {
      const healthResponse = await this.client.health();

      // The response from getBackendSrv().fetch() includes status, data, etc.
      // Check if we have a successful response and the data indicates healthy status
      if (healthResponse.status === 200) {
        const data = healthResponse.data;
        // Check if the response data has the expected health structure
        if (data && (data.status === 'healthy' || data.status === 'ok')) {
          return {
            status: 'success',
            message: `Successfully connected to ${data.service || 'Mirador Core'} v${data.version || 'unknown'}`,
          };
        } else if (data) {
          // If we have data but status is not healthy, show the actual status
          return {
            status: 'error',
            message: `Service status: ${data.status || 'unknown'}`,
          };
        } else {
          // If no data, assume success since we got 200
          return {
            status: 'success',
            message: 'Successfully connected to Mirador Core API',
          };
        }
      } else {
        return {
          status: 'error',
          message: `HTTP ${healthResponse.status}: ${healthResponse.statusText || 'Connection failed'}`,
        };
      }
    } catch (err: any) {
      return {
        status: 'error',
        message: err.message || defaultErrorMessage,
      };
    }
  }

  // Public method to get log fields for the visual query builder
  async getLogFields(): Promise<string[]> {
    try {
      const response = await this.client.logFields();
      console.log('Log fields response:', response);

      // Handle different possible response structures
      // Grafana's backend proxy wraps the API response in a 'data' property
      let fields: string[] = [];

      // Check if response.data exists (Grafana proxy wrapping)
      const apiResponse = response?.data || response;

      // Mirador Core format: fields are under data.fields
      if (apiResponse?.data?.fields && Array.isArray(apiResponse.data.fields)) {
        fields = apiResponse.data.fields;
      }
      // Alternative: fields directly under data
      else if (apiResponse?.data && Array.isArray(apiResponse.data)) {
        fields = apiResponse.data;
      }
      // Direct fields array
      else if (apiResponse?.fields && Array.isArray(apiResponse.fields)) {
        fields = apiResponse.fields;
      }
      // Raw array response
      else if (Array.isArray(apiResponse)) {
        fields = apiResponse;
      }

      console.log('Extracted log fields:', fields);
      return fields;
    } catch (error) {
      console.error('Failed to get log fields:', error);
      // Return default fields if API call fails
      return ['timestamp', 'body', 'severity'];
    }
  }
}
