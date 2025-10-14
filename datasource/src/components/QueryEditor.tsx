import React, { ChangeEvent, useState, useEffect } from 'react';
import { InlineField, Input, Select, Stack, Switch, Button, IconButton } from '@grafana/ui';
import { QueryEditorProps, SelectableValue } from '@grafana/data';
import { DataSource } from '../datasource';
import { MyDataSourceOptions, MyQuery, VisualQueryCondition } from '../types';

type Props = QueryEditorProps<DataSource, MyQuery, MyDataSourceOptions>;

const queryTypeOptions: SelectableValue[] = [
  { label: 'Logs', value: 'logs' },
  { label: 'Metrics', value: 'metrics' },
  { label: 'Traces', value: 'traces' },
];

const queryEngineOptions: SelectableValue[] = [
  { label: 'Bleve (Recommended)', value: 'bleve' },
  { label: 'Lucene', value: 'lucene' },
];

const operatorOptions: SelectableValue[] = [
  { label: '=', value: 'equals' },
  { label: '!=', value: 'not_equals' },
  { label: 'contains', value: 'contains' },
  { label: 'not contains', value: 'not_contains' },
  { label: 'starts with', value: 'starts_with' },
  { label: 'ends with', value: 'ends_with' },
  { label: 'regex', value: 'regex' },
  { label: '>', value: 'gt' },
  { label: '>=', value: 'gte' },
  { label: '<', value: 'lt' },
  { label: '<=', value: 'lte' },
];

const logicalOperatorOptions: SelectableValue[] = [
  { label: 'AND', value: 'AND' },
  { label: 'OR', value: 'OR' },
];

export function QueryEditor({ query, onChange, onRunQuery, datasource }: Props) {
  const [logFields, setLogFields] = useState<string[]>([]);
  const [loadingFields, setLoadingFields] = useState(false);

  const { queryType, queryText, useVisualQuery, visualQuery, queryEngine } = query;

  // Debug logging for state changes
  useEffect(() => {
    console.log('QueryEditor state:', { queryType, useVisualQuery, logFields, loadingFields });
  }, [queryType, useVisualQuery, logFields, loadingFields]);

  useEffect(() => {
    if (queryType === 'logs' && useVisualQuery) {
      console.log('Loading log fields...');
      loadLogFields();
    }
  }, [queryType, useVisualQuery]);

  const loadLogFields = async () => {
    if (!datasource) return;

    setLoadingFields(true);
    try {
      console.log('Loading log fields via datasource.getLogFields()...');
      const fields = await datasource.getLogFields();
      console.log('Log fields loaded:', fields);
      setLogFields(fields);
    } catch (error) {
      console.error('Failed to load log fields:', error);
      // Fallback to default fields if API fails
      setLogFields(['timestamp', 'body', 'severity']);
    } finally {
      setLoadingFields(false);
    }
  };

  const onQueryTypeChange = (value: SelectableValue) => {
    onChange({ ...query, queryType: value.value, useVisualQuery: false });
  };

  const onQueryEngineChange = (value: SelectableValue) => {
    onChange({ ...query, queryEngine: value.value });
  };

  const onQueryTextChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...query, queryText: event.target.value });
  };

  const onUseVisualQueryChange = (event: ChangeEvent<HTMLInputElement>) => {
    const useVisual = event.target.checked;
    let initialVisualQuery = visualQuery;

    // If enabling visual query and no conditions exist, create an initial one
    if (useVisual && (!visualQuery || visualQuery.length === 0)) {
      initialVisualQuery = [{
        field: logFields.length > 0 ? logFields[0] : '',
        operator: 'equals',
        value: '',
        logicalOperator: 'AND'
      }];
    }

    onChange({
      ...query,
      useVisualQuery: useVisual,
      visualQuery: initialVisualQuery,
      queryText: useVisual ? buildLuceneQuery(initialVisualQuery || []) : queryText
    });
  };

  const onVisualQueryChange = (newVisualQuery: VisualQueryCondition[]) => {
    const luceneQuery = buildLuceneQuery(newVisualQuery);
    onChange({
      ...query,
      visualQuery: newVisualQuery,
      queryText: luceneQuery
    });
  };

  const buildLuceneQuery = (conditions: VisualQueryCondition[]): string => {
    if (conditions.length === 0) return '';

    return conditions.map((condition, index) => {
      let query = '';

      switch (condition.operator) {
        case 'equals':
          query = `${condition.field}:"${condition.value}"`;
          break;
        case 'not_equals':
          query = `NOT ${condition.field}:"${condition.value}"`;
          break;
        case 'contains':
          query = `${condition.field}:*${condition.value}*`;
          break;
        case 'not_contains':
          query = `NOT ${condition.field}:*${condition.value}*`;
          break;
        case 'starts_with':
          query = `${condition.field}:${condition.value}*`;
          break;
        case 'ends_with':
          query = `${condition.field}:*${condition.value}`;
          break;
        case 'regex':
          query = `${condition.field}:/${condition.value}/`;
          break;
        case 'gt':
          query = `${condition.field}:{${condition.value} TO *}`;
          break;
        case 'gte':
          query = `${condition.field}:[${condition.value} TO *]`;
          break;
        case 'lt':
          query = `${condition.field}:{* TO ${condition.value}}`;
          break;
        case 'lte':
          query = `${condition.field}:[* TO ${condition.value}]`;
          break;
        default:
          query = `${condition.field}:"${condition.value}"`;
      }

      if (index > 0 && condition.logicalOperator) {
        query = ` ${condition.logicalOperator} ${query}`;
      }

      return query;
    }).join('');
  };

  const addCondition = () => {
    const newCondition: VisualQueryCondition = {
      field: logFields[0] || '',
      operator: 'equals',
      value: '',
      logicalOperator: 'AND'
    };
    const newVisualQuery = [...(visualQuery || []), newCondition];
    onVisualQueryChange(newVisualQuery);
  };

  const updateCondition = (index: number, updates: Partial<VisualQueryCondition>) => {
    const newVisualQuery = [...(visualQuery || [])];
    newVisualQuery[index] = { ...newVisualQuery[index], ...updates };
    onVisualQueryChange(newVisualQuery);
  };

  const removeCondition = (index: number) => {
    const newVisualQuery = (visualQuery || []).filter((_, i) => i !== index);
    onVisualQueryChange(newVisualQuery);
  };

  return (
    <Stack gap={0}>
      <InlineField label="Query Type" labelWidth={16}>
        <Select
          options={queryTypeOptions}
          value={queryType}
          onChange={onQueryTypeChange}
          width={16}
        />
      </InlineField>

      {queryType === 'logs' && (
        <InlineField label="Query Engine" labelWidth={16} tooltip="Search engine for log queries">
          <Select
            options={queryEngineOptions}
            value={queryEngine || 'bleve'}
            onChange={onQueryEngineChange}
            width={16}
          />
        </InlineField>
      )}

      {queryType === 'logs' && (
        <InlineField label="Visual Query Builder" labelWidth={16}>
          <Switch
            value={useVisualQuery || false}
            onChange={onUseVisualQueryChange}
          />
        </InlineField>
      )}

      {(!useVisualQuery || queryType !== 'logs') && (
        <InlineField label="Query Text" labelWidth={16} tooltip="Enter your query">
          <Input
            id="query-editor-query-text"
            onChange={onQueryTextChange}
            value={queryText || ''}
            required
            placeholder={queryType === 'logs' ? 'Enter Lucene query (e.g., service.name:telemetrygen)' : 'Enter query'}
          />
        </InlineField>
      )}

      {useVisualQuery && queryType === 'logs' && (
        <Stack gap={1}>
          <div>
            <Button onClick={addCondition} size="sm" icon="plus">
              Add Condition
            </Button>
          </div>

          {(visualQuery || []).map((condition, index) => (
            <Stack key={index} gap={1} direction="row" alignItems="center">
              {index > 0 && (
                <Select
                  options={logicalOperatorOptions}
                  value={condition.logicalOperator}
                  onChange={(value) => updateCondition(index, { logicalOperator: value.value })}
                  width={8}
                />
              )}

              <Select
                options={logFields.map(field => ({ label: field, value: field }))}
                value={condition.field}
                onChange={(value) => updateCondition(index, { field: value.value })}
                placeholder={loadingFields ? 'Loading fields...' : 'Select field'}
                width={20}
                isLoading={loadingFields}
              />

              <Select
                options={operatorOptions}
                value={condition.operator}
                onChange={(value) => updateCondition(index, { operator: value.value })}
                width={12}
              />

              <Input
                value={condition.value}
                onChange={(e: ChangeEvent<HTMLInputElement>) => updateCondition(index, { value: e.target.value })}
                placeholder="Enter value"
                width={20}
              />

              <IconButton
                name="trash-alt"
                onClick={() => removeCondition(index)}
                tooltip="Remove condition"
              />
            </Stack>
          ))}

          <InlineField label="Generated Query" labelWidth={16}>
            <Input
              value={queryText || ''}
              readOnly
              placeholder="Generated Lucene query will appear here"
            />
          </InlineField>
        </Stack>
      )}
    </Stack>
  );
}
