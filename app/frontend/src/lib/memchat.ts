import { client } from './api';

export type MemoryMode = 'off' | 'use' | 'learn';

export const CATEGORIES = ['偏好', '个人背景', '项目信息', '约定'] as const;
export type Category = (typeof CATEGORIES)[number];

export const MODE_OPTIONS: { value: MemoryMode; label: string; desc: string }[] = [
  { value: 'off', label: '关闭', desc: '不读取也不写入长期记忆' },
  { value: 'use', label: '仅使用', desc: '只召回已有记忆，不新增或修改' },
  { value: 'learn', label: '使用+自动学习', desc: '召回记忆，并自动提炼新经验' },
];

export interface Memory {
  memory_id: number;
  title: string;
  scene: string;
  content: string;
  category: string;
  confidence: number;
  source: string;
  source_session_id: number | null;
  status: string;
  create_time: string | null;
  update_time: string | null;
  hit_count?: number;
  reason?: string;
  before?: string;
}

export interface MemoryEvents {
  mode: MemoryMode;
  explicit: boolean;
  recalled: Partial<Memory>[];
  created: Memory[];
  updated: Memory[];
  deleted: Memory[];
  notice: string;
}

export interface Conversation {
  id: number;
  title: string;
  last_active: string | null;
}

export interface ChatMsg {
  id: string | number;
  role: 'user' | 'assistant';
  content: string;
  recalled?: Partial<Memory>[];
  events?: MemoryEvents | null;
  status?: 'thinking' | 'streaming' | 'memorizing' | 'done' | 'error';
  error?: string;
}

export interface Rule {
  id: number;
  content: string;
  enabled: boolean;
  create_time: string | null;
}

export interface PrepareResult {
  conversation: Conversation;
  messages: { role: string; content: string }[];
  model: string;
  mode: MemoryMode;
  rules_count: number;
  session_window: number;
  recalled: Memory[];
}

export interface MemoryInput {
  title: string;
  scene: string;
  content: string;
  category: string;
}

export function errMsg(e: unknown): string {
  const err = e as { data?: { detail?: unknown }; response?: { data?: { detail?: unknown } }; message?: string };
  const detail = err?.data?.detail ?? err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return '输入内容不符合要求';
  return err?.message || '请求失败';
}

async function call<T>(url: string, method = 'GET', data?: unknown): Promise<T> {
  const res = await client.apiCall.invoke({ url, method, data, options: { timeout: 120_000 } });
  return res.data as T;
}

const BASE = '/api/v1/memchat';

export const memApi = {
  prepare: (conversation_id: number | null, message: string) =>
    call<PrepareResult>(`${BASE}/prepare`, 'POST', { conversation_id, message }),
  finalize: (conversation_id: number, user_message: string, assistant_message: string, recalled: Partial<Memory>[]) =>
    call<{ message_id: number; events: MemoryEvents }>(`${BASE}/finalize`, 'POST', {
      conversation_id,
      user_message,
      assistant_message,
      recalled,
    }),
  conversations: () => call<{ items: Conversation[] }>(`${BASE}/conversations`),
  messages: (id: number) =>
    call<{ items: { id: number; role: 'user' | 'assistant'; content: string; events: MemoryEvents | null }[] }>(
      `${BASE}/conversations/${id}/messages`,
    ),
  deleteConversation: (id: number) => call(`${BASE}/conversations/${id}`, 'DELETE'),
  getMode: () => call<{ mode: MemoryMode }>(`${BASE}/settings`),
  setMode: (mode: MemoryMode) => call<{ mode: MemoryMode }>(`${BASE}/settings`, 'PUT', { mode }),
  memories: () => call<{ items: Memory[] }>(`${BASE}/memories`),
  createMemory: (data: MemoryInput) => call<Memory>(`${BASE}/memories`, 'POST', data),
  updateMemory: (id: number, data: MemoryInput) => call<Memory>(`${BASE}/memories/${id}`, 'PUT', data),
  deleteMemory: (id: number) => call(`${BASE}/memories/${id}`, 'DELETE'),
  rules: () => call<{ items: Rule[] }>(`${BASE}/rules`),
  createRule: (content: string) => call<Rule>(`${BASE}/rules`, 'POST', { content, enabled: true }),
  updateRule: (id: number, content: string, enabled: boolean) =>
    call<Rule>(`${BASE}/rules/${id}`, 'PUT', { content, enabled }),
  deleteRule: (id: number) => call(`${BASE}/rules/${id}`, 'DELETE'),
};

export function streamReply(
  messages: { role: string; content: string }[],
  model: string,
  onChunk: (text: string) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let acc = '';
    let settled = false;
    client.ai
      .gentxt({
        messages: messages as never,
        model,
        stream: true,
        timeout: 180_000,
        onChunk: (chunk) => {
          acc += chunk.content || '';
          onChunk(acc);
        },
        onComplete: (result) => {
          if (settled) return;
          settled = true;
          resolve(result?.content || acc);
        },
        onError: (error) => {
          if (settled) return;
          settled = true;
          reject(error);
        },
      })
      .then((result) => {
        if (settled) return;
        settled = true;
        resolve(result?.content || acc);
      })
      .catch((e) => {
        if (settled) return;
        settled = true;
        reject(e);
      });
  });
}

export function formatTime(ts: string | null | undefined): string {
  if (!ts) return '';
  const d = new Date(ts);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} 天前`;
  return d.toLocaleDateString('zh-CN');
}

const CDN = 'https://public-frontend-cos.metadl.com/nuxt-mgx/prod/assets';
export const AGENT_AVATARS = [
  `${CDN}/Mike-TeamLeader-Avatar_origin.DmBYWaXT.webp`,
  `${CDN}/Emma-ProductManager-Avatar_origin.BBeqkRr7.webp`,
  `${CDN}/Bob-Architect-Avatar_origin.Cdi-oMPW.webp`,
  `${CDN}/Alex-Engineer-Avatar_origin.zHMG8gqX.webp`,
  `${CDN}/David-DataAnalyst-Avatar_origin.CahzHabe.webp`,
  `${CDN}/Iris-DeepResearcher-Avatar_origin.uohFf0-y.webp`,
];
export const ASSISTANT_AVATAR = AGENT_AVATARS[0];
export const LOGO_URL = `${CDN}/Union.CbOOVtn6.svg`;
