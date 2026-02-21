// ============================================================
// Cross-Connector Rules Engine
// Evaluates rules across events to escalate, suppress, tag, etc.
// ============================================================

import type {
  ConnectorEvent,
  CrossConnectorRule,
  RuleCondition,
} from '@shared/types';

export class RulesEngine {
  private rules: CrossConnectorRule[] = [];

  setRules(rules: CrossConnectorRule[]): void {
    this.rules = [...rules].sort((a, b) => a.priority - b.priority);
  }

  getRules(): CrossConnectorRule[] {
    return this.rules;
  }

  /** Evaluate rules against an event, returning a potentially modified event */
  evaluate(event: ConnectorEvent): ConnectorEvent | null {
    let modified = { ...event };

    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      const matches = this.matchesConditions(modified, rule);
      if (!matches) continue;

      for (const action of rule.actions) {
        switch (action.type) {
          case 'suppress':
            return null; // Event is suppressed

          case 'escalate':
            modified.severity = (action.params.severity as string as ConnectorEvent['severity']) ?? 'attention';
            break;

          case 'tag': {
            const tag = action.params.tag as string;
            if (tag) {
              modified.metadata = { ...modified.metadata, tag };
              modified.category = tag;
            }
            break;
          }

          case 'notify': {
            // Force attention-level to trigger sound/surface
            if (!modified.uiHints) modified.uiHints = {};
            modified.uiHints.blinkDurationMs = (action.params.blinkMs as number) ?? 30_000;
            if (modified.severity === 'info' || modified.severity === 'warning') {
              modified.severity = 'attention';
            }
            break;
          }

          case 'group': {
            const groupKey = action.params.groupKey as string;
            if (groupKey) {
              modified.metadata = { ...modified.metadata, groupKey };
            }
            break;
          }
        }
      }
    }

    return modified;
  }

  private matchesConditions(event: ConnectorEvent, rule: CrossConnectorRule): boolean {
    const results = rule.conditions.map(c => this.evaluateCondition(event, c));

    if (rule.matchMode === 'all') {
      return results.every(Boolean);
    }
    return results.some(Boolean);
  }

  private evaluateCondition(event: ConnectorEvent, condition: RuleCondition): boolean {
    const fieldValue = this.getFieldValue(event, condition.field);
    if (fieldValue === undefined || fieldValue === null) return false;

    const strValue = String(fieldValue);

    switch (condition.operator) {
      case 'equals':
        return strValue === condition.value;
      case 'contains':
        return strValue.toLowerCase().includes(condition.value.toLowerCase());
      case 'matches':
        try {
          return new RegExp(condition.value, 'i').test(strValue);
        } catch {
          return false;
        }
      case 'gt':
        return Number(strValue) > Number(condition.value);
      case 'lt':
        return Number(strValue) < Number(condition.value);
      default:
        return false;
    }
  }

  private getFieldValue(event: ConnectorEvent, field: RuleCondition['field']): unknown {
    switch (field) {
      case 'severity': return event.severity;
      case 'title': return event.title;
      case 'body': return event.body;
      case 'category': return event.category;
      case 'eventType': return event.eventType;
      case 'connectorId': return event.connectorId;
      case 'status': return event.status;
      default: return undefined;
    }
  }
}
