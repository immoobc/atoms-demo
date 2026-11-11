import { client } from './api';
import { errMsg, type Memory, type MemoryEvents } from './memchat';

export { errMsg };

export interface Project {
  id: number;
  name: string;
  goal: string;
  background: string;
  acceptance: string;
  create_time: string | null;
  update_time: string | null;
  memory_count: number;
  latest_version: number;
  latest_status: RunStatus | null;
}

export type RunStatus = 'running' | 'done' | 'failed';
export type RunStage = 'lead' | 'dev' | 'fix' | 'memory' | 'done' | 'failed';

export interface LeadOutput {
  summary: string;
  tasks: { id: number; title: string; detail: string; owner: string }[];
  deliverables: string[];
  acceptance_points: string[];
  risks: string[];
}

export interface DevOutput {
  stack: string;
  delivery_log: string[];
  self_check: { passed: boolean; items: { point: string; passed: boolean; evidence: string }[]; notes: string };
  fix_round: number;
}

export interface Run {
  id: number;
  project_id: number;
  version: number;
  prompt: string;
  status: RunStatus;
  stage: RunStage;
  fix_rounds: number;
  error: string;
  create_time: string | null;
  update_time: string | null;
  lead_output: LeadOutput | null;
  dev_output: DevOutput | null;
  files: Record<string, string>;
  memory_events: MemoryEvents | null;
}

export interface RoleField {
  field: string;
  type: string;
  desc: string;
}

export interface RoleSpec {
  key: string;
  name: string;
  model: string;
  purpose: string;
  input: RoleField[];
  output: RoleField[];
}

export interface ProjectMemory extends Memory {
  linked: boolean;
  relation: 'bound' | 'derived' | null;
}

export interface ProjectInput {
  name: string;
  goal: string;
  background: string;
  acceptance: string;
}

async function call<T>(url: string, method = 'GET', data?: unknown): Promise<T> {
  const res = await client.apiCall.invoke({ url, method, data, options: { timeout: 60_000 } });
  return res.data as T;
}

const BASE = '/api/v1/projects';

export const projApi = {
  list: () => call<{ items: Project[] }>(BASE),
  create: (data: ProjectInput) => call<Project>(BASE, 'POST', data),
  get: (id: number) => call<{ project: Project; runs: Run[] }>(`${BASE}/${id}`),
  update: (id: number, data: ProjectInput) => call<Project>(`${BASE}/${id}`, 'PUT', data),
  remove: (id: number) => call(`${BASE}/${id}`, 'DELETE'),
  roleSpecs: () => call<{ items: RoleSpec[] }>(`${BASE}/role-specs`),
  memories: (id: number) => call<{ items: ProjectMemory[] }>(`${BASE}/${id}/memories`),
  link: (id: number, memory_id: number) => call(`${BASE}/${id}/memories`, 'POST', { memory_id }),
  unlink: (id: number, memory_id: number) => call(`${BASE}/${id}/memories/${memory_id}`, 'DELETE'),
  run: (id: number, runId: number) => call<Run>(`${BASE}/${id}/runs/${runId}`),
  createRun: (id: number, prompt: string) => call<Run>(`${BASE}/${id}/runs`, 'POST', { prompt }),
};

/** Inline local css/js files into index.html so the app can run inside an iframe srcdoc sandbox. */
export function bundleHtml(files: Record<string, string>): string {
  const html = files['index.html'] ?? '';
  const isLocal = (p: string) => !/^(https?:)?\/\//.test(p) && !p.startsWith('data:');
  const key = (p: string) => p.replace(/^\.?\//, '');
  return html
    .replace(/<link[^>]*href="([^"]+\.css)"[^>]*>/g, (tag: string, p: string) =>
      isLocal(p) && files[key(p)] !== undefined ? `<style>\n${files[key(p)]}\n</style>` : tag,
    )
    .replace(/<script([^>]*)src="([^"]+\.js)"([^>]*)>\s*<\/script>/g, (tag: string, pre: string, p: string, post: string) => {
      if (!isLocal(p) || files[key(p)] === undefined) return tag;
      const attrs = `${pre} ${post}`.includes('module') ? ' type="module"' : '';
      return `<script${attrs}>\n${files[key(p)].replace(/<\/script>/gi, '<\\/script>')}\n</script>`;
    });
}

export const STAGE_STEPS = [
  { key: 'lead', label: '项目主管', sub: '拆解目标 · 制定方案' },
  { key: 'dev', label: '开发工程师', sub: '生成代码 · 自测' },
  { key: 'memory', label: '记忆沉淀', sub: '写入项目结论' },
] as const;

/** Index of the currently active step (3 = all done). */
export function activeStep(run: Run): number {
  if (run.status === 'done') return 3;
  if (run.status === 'failed') {
    if (!run.lead_output) return 0;
    if (!run.dev_output) return 1;
    return 2;
  }
  if (run.stage === 'lead') return 0;
  if (run.stage === 'dev' || run.stage === 'fix') return 1;
  return 2;
}
