const RETURN_KEY = 'atoms:returnTo';
const BLOCKED = /^\/(login|register|auth)(\/|$|\?)/;

/** Remember where to go after the hosted Atoms Cloud login completes (the callback always lands on "/"). */
export function rememberReturn(path: string | null | undefined): void {
  if (path && path.startsWith('/') && !path.startsWith('//') && !BLOCKED.test(path)) {
    sessionStorage.setItem(RETURN_KEY, path);
  }
}

export function takeReturn(): string | null {
  const p = sessionStorage.getItem(RETURN_KEY);
  sessionStorage.removeItem(RETURN_KEY);
  return p;
}

export const LAST_CONVERSATION_KEY = 'atoms:lastConversation';
