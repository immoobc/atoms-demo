export interface DiffLine {
  type: 'same' | 'add' | 'del';
  text: string;
  a?: number;
  b?: number;
}

const MAX_CELLS = 4_000_000;

/** Line-level LCS diff between two texts. */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const A = oldText ? oldText.split('\n') : [];
  const B = newText ? newText.split('\n') : [];
  const n = A.length;
  const m = B.length;
  if (n * m > MAX_CELLS) {
    return [
      ...A.map((text, i) => ({ type: 'del' as const, text, a: i + 1 })),
      ...B.map((text, i) => ({ type: 'add' as const, text, b: i + 1 })),
    ];
  }
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      out.push({ type: 'same', text: A[i], a: i + 1, b: j + 1 });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: 'del', text: A[i], a: i + 1 });
      i += 1;
    } else {
      out.push({ type: 'add', text: B[j], b: j + 1 });
      j += 1;
    }
  }
  while (i < n) out.push({ type: 'del', text: A[i], a: (i += 1) });
  while (j < m) out.push({ type: 'add', text: B[j], b: (j += 1) });
  return out;
}

export function diffStats(lines: DiffLine[]): { add: number; del: number } {
  let add = 0;
  let del = 0;
  for (const l of lines) {
    if (l.type === 'add') add += 1;
    else if (l.type === 'del') del += 1;
  }
  return { add, del };
}
