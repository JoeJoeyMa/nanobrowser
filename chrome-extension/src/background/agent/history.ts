import type { ActionResult, StepMetadata } from './types';
import type { BrowserStateHistory } from '../browser/views';

export class AgentStepRecord {
  modelOutput: string | null;
  result: ActionResult[];
  state: BrowserStateHistory;
  metadata?: StepMetadata | null;

  constructor(
    modelOutput: string | null,
    result: ActionResult[],
    state: BrowserStateHistory,
    metadata?: StepMetadata | null,
  ) {
    this.modelOutput = modelOutput;
    this.result = result;
    this.state = state;
    this.metadata = metadata;
  }
}

export class AgentStepHistory {
  history: AgentStepRecord[];

  constructor(history?: AgentStepRecord[]) {
    this.history = history ?? [];
  }
}

// OperationLog 类型（与 actions/builder.ts 保持一致）
export interface OperationLog {
  timestamp: string;
  action: string;
  params: unknown;
  context: {
    url: string;
    title: string;
    tabId: number;
    screenshot?: string | null;
  };
  target?: {
    xpath?: string | null;
    cssSelector?: string;
    tagName?: string | null;
    elementText?: string;
    attributes?: Record<string, string>;
    frameUrl?: string;
    screenshot?: string | null;
  };
  result: {
    success: boolean;
    error: string | null;
    extractedContent?: string | null;
  };
}

// 日志导出为美化 JSON 文件
export async function exportOperationLogs(logs: OperationLog[], filePath: string) {
  const fs = await import('fs');
  const data = JSON.stringify(logs, null, 2);
  fs.writeFileSync(filePath, data, 'utf-8');
}

// 控制台美化输出日志
export function prettyPrintOperationLogs(logs: OperationLog[]) {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(logs, null, 2));
}
