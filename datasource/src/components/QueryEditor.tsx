import React, { ChangeEvent, useState, useEffect } from 'react';
import { InlineField, Input, Select, Stack, Button, IconButton, RadioButtonGroup, Field, FieldSet, QueryField } from '@grafana/ui';
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

const editorModeOptions = [
  { label: 'Builder', value: 'builder' },
  { label: 'Code', value: 'code' },
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

  const { queryType, queryText, editorMode, visualQuery, queryEngine } = query;

  useEffect(() => {
    if (queryType === 'logs' && editorMode === 'builder') {
      loadLogFields();
    }
  }, [queryType, editorMode]);

  const loadLogFields = async () => {
    if (!datasource) return;

    setLoadingFields(true);
    try {
      const fields = await datasource.getLogFields();
      setLogFields(fields);
    } catch (error) {
      console.error('Failed to load log fields:', error);
      setLogFields(['timestamp', 'body', 'severity']);
    } finally {
      setLoadingFields(false);
    }
  };

  const onQueryTypeChange = (value: SelectableValue) => {
    onChange({ ...query, queryType: value.value });
  };

  const onQueryEngineChange = (value: SelectableValue) => {
    onChange({ ...query, queryEngine: value.value });
  };

  const onEditorModeChange = (value: string) => {
    const newEditorMode = value as 'builder' | 'code';
    let newQuery = { ...query, editorMode: newEditorMode };

    // If switching to builder mode and no visual query exists, create initial condition
    if (newEditorMode === 'builder' && (!visualQuery || visualQuery.length === 0)) {
      newQuery.visualQuery = [{
        field: logFields.length > 0 ? logFields[0] : '',
        operator: 'equals',
        value: '',
        logicalOperator: 'AND'
      }];
      newQuery.queryText = '';
    }
    // If switching to code mode, generate query text from visual query
    else if (newEditorMode === 'code' && visualQuery && visualQuery.length > 0) {
      newQuery.queryText = buildLuceneQuery(visualQuery);
    }

    onChange(newQuery);
  };

  const onQueryTextChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...query, queryText: event.target.value });
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
    <Stack gap={2}>
      <InlineField label="Query Type" labelWidth={16}>
        <Select
          options={queryTypeOptions}
          value={queryType}
          onChange={onQueryTypeChange}
          width={16}
        />
      </InlineField>

      {queryType === 'logs' && (
        <>
          <InlineField label="Query Engine" labelWidth={16} tooltip="Search engine for log queries">
            <Select
              options={queryEngineOptions}
              value={queryEngine || 'bleve'}
              onChange={onQueryEngineChange}
              width={16}
            />
          </InlineField>

          <InlineField label="Editor Mode" labelWidth={16}>
            <RadioButtonGroup
              options={editorModeOptions}
              value={editorMode || 'code'}
              onChange={onEditorModeChange}
            />
          </InlineField>
        </>
      )}

      {queryType === 'logs' && editorMode === 'code' && (
        <Field label="Query" description="Enter Lucene query">
          <QueryField
            query={queryText || ''}
            onChange={(value) => onChange({ ...query, queryText: value })}
            onRunQuery={onRunQuery}
            placeholder='service.name:"otelgen"'
            portalOrigin="body"
          />
        </Field>
      )}

      {queryType === 'logs' && editorMode === 'builder' && (
        <FieldSet label="Visual Query Builder">
          <Stack gap={2}>
            <Field>
              <Button onClick={addCondition} size="sm" icon="plus">
                Add condition
              </Button>
            </Field>

            {(visualQuery || []).map((condition, index) => (
              <div key={index} style={{ width: '100%', overflow: 'hidden' }}>
                <Stack gap={1} direction="row" alignItems="center" wrap="wrap">
                  {index > 0 && (
                    <Select
                      options={logicalOperatorOptions}
                      value={condition.logicalOperator}
                      onChange={(value) => updateCondition(index, { logicalOperator: value.value })}
                      width={6}
                    />
                  )}

                  <Select
                    options={logFields.map(field => ({ label: field, value: field }))}
                    value={condition.field}
                    onChange={(value) => updateCondition(index, { field: value.value })}
                    placeholder={loadingFields ? 'Loading fields...' : 'Select field'}
                    width={16}
                    isLoading={loadingFields}
                  />

                  <Select
                    options={operatorOptions}
                    value={condition.operator}
                    onChange={(value) => updateCondition(index, { operator: value.value })}
                    width={10}
                  />

                  <Input
                    value={condition.value}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => updateCondition(index, { value: e.target.value })}
                    placeholder="value"
                    width={16}
                  />

                  <IconButton
                    name="trash-alt"
                    onClick={() => removeCondition(index)}
                    tooltip="Remove condition"
                  />
                </Stack>
              </div>
            ))}

            <Field label="Generated Query" description="Lucene query generated from visual conditions">
              <Input
                value={queryText || ''}
                readOnly
                placeholder="Generated query will appear here"
              />
            </Field>
          </Stack>
        </FieldSet>
      )}

      {(queryType === 'metrics' || queryType === 'traces') && (
        <InlineField label="Query" labelWidth={16}>
          <Input
            value={queryText || ''}
            onChange={onQueryTextChange}
            placeholder={`Enter ${queryType} query`}
          />
        </InlineField>
      )}
    </Stack>
  );
}
