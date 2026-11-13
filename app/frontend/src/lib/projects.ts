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
export type RunKind = 'pipeline' | 'manual' | 'rollback';

export interface LeadOutput {
  summary: string;
  tasks: { id: number; title: string; detail: string; owner: string }[];
  deliverables: string[];
  acceptance_points: string[];
  risks: string[];
}

export interface CheckItem {
  point: string;
  passed: boolean;
  evidence: string;
  kind?: 'acceptance' | 'static';
}

export interface DevOutput {
  stack: string;
  delivery_log: string[];
  self_check: { passed: boolean; items: CheckItem[]; notes: string };
  fix_round: number;
  kind?: RunKind;
  source_version?: number | null;
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
  stream: string;
  stream_length: number;
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

async function call<T>(url: string, method = 'GET', data?: unknown, timeout = 60_000): Promise<T> {
  const res = await client.apiCall.invoke({ url, method, data, options: { timeout } });
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
  createRun: (id: number, prompt: string, base_run_id: number | null = null) =>
    call<Run>(`${BASE}/${id}/runs`, 'POST', { prompt, base_run_id }),
  cancel: (id: number, runId: number) => call<Run>(`${BASE}/${id}/runs/${runId}/cancel`, 'POST', {}),
  retry: (id: number, runId: number) => call<Run>(`${BASE}/${id}/runs/${runId}/retry`, 'POST', {}),
  rollback: (id: number, runId: number) => call<Run>(`${BASE}/${id}/runs/${runId}/rollback`, 'POST', {}),
  saveVersion: (id: number, files: Record<string, string>, base_run_id: number | null, note = '') =>
    call<Run>(`${BASE}/${id}/versions`, 'POST', { files, base_run_id, note }),
  zip: (id: number, runId: number) => call<{ filename: string; base64: string }>(`${BASE}/${id}/runs/${runId}/zip`),
};

export const LAST_PROJECT_KEY = 'atoms:lastProject';
export const TOPUP_URL = 'https://atoms.dev/dashboard?settings=cloudAiBalance';

export const isUsable = (r: Run) => r.status === 'done' && Object.keys(r.files || {}).length > 0;
export const runKind = (r: Run): RunKind => r.dev_output?.kind ?? 'pipeline';
export const isBalanceError = (msg: string) => /余额|insufficient_ai_balance/i.test(msg);

export function sortFiles(names: string[]): string[] {
  return [...names].sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b)));
}

/** File currently being written in the developer's live stream. */
export function streamingFile(stream: string): string | null {
  const matches = [...stream.matchAll(/<file\s+(?:path|name)\s*=\s*["']([^"']+)["']/gi)];
  return matches.length ? matches[matches.length - 1][1] : null;
}

export async function downloadZip(projectId: number, runId: number): Promise<void> {
  const { filename, base64 } = await projApi.zip(projectId, runId);
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const PREVIEW_MSG = '__atomsPreview';

/** Injected first into previews: reports runtime errors to the parent and shims storage in opaque-origin sandboxes. */
const PREVIEW_RUNTIME = `<script>(function(){
function send(t,m){try{parent.postMessage({${PREVIEW_MSG}:1,type:t,message:String(m).slice(0,600)},'*')}catch(e){}}
function mem(){var d={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null},setItem:function(k,v){d[k]=String(v)},removeItem:function(k){delete d[k]},clear:function(){d={}},key:function(i){return Object.keys(d)[i]||null},get length(){return Object.keys(d).length}}}
['localStorage','sessionStorage'].forEach(function(n){try{window[n].getItem('__probe')}catch(e){try{Object.defineProperty(window,n,{configurable:true,value:mem()})}catch(_){}}});
window.addEventListener('error',function(e){if(e.target&&e.target!==window&&(e.target.src||e.target.href)){send('resource','资源加载失败：'+(e.target.src||e.target.href));return}send('error',(e.message||'Error')+(e.lineno?' （第 '+e.lineno+' 行）':''))},true);
window.addEventListener('unhandledrejection',function(e){var r=e.reason;send('error','未处理的 Promise 异常：'+(r&&r.message||r))});
var ce=console.error;console.error=function(){send('console',[].slice.call(arguments).map(function(a){return a&&a.message?a.message:typeof a==='object'?JSON.stringify(a):String(a)}).join(' '));return ce.apply(console,arguments)};
})();</script>`;

const fileKey = (p: string) => p.replace(/^(\.\/)+/, '').replace(/^\//, '');

/** Merge local css/js into index.html so a multi-file app runs inside an iframe srcdoc sandbox. */
export function bundleHtml(files: Record<string, string>, withRuntime = true): string {
  let html = files['index.html'] ?? '';
  const isLocal = (p: string) => !/^(https?:)?\/\//.test(p) && !p.startsWith('data:');
  html = html
    .replace(/<link\b[^>]*?href\s*=\s*["']([^"']+?\.css)(?:\?[^"']*)?["'][^>]*>/gi, (tag: string, p: string) =>
      isLocal(p) && files[fileKey(p)] !== undefined ? `<style data-file="${fileKey(p)}">\n${files[fileKey(p)]}\n</style>` : tag,
    )
    .replace(
      /<script\b([^>]*?)src\s*=\s*["']([^"']+?\.js)(?:\?[^"']*)?["']([^>]*)>\s*<\/script>/gi,
      (tag: string, pre: string, p: string, post: string) => {
        if (!isLocal(p) || files[fileKey(p)] === undefined) return tag;
        const attrs = `${pre} ${post}`.includes('module') ? ' type="module"' : '';
        return `<script${attrs} data-file="${fileKey(p)}">\n${files[fileKey(p)].replace(/<\/script>/gi, '<\\/script>')}\n</script>`;
      },
    );
  if (!withRuntime) return html;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + PREVIEW_RUNTIME) : PREVIEW_RUNTIME + html;
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
