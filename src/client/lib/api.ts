import type {
  FireResponse,
  InitResponse,
  PracticeLogResponse,
  PracticeResponse,
  ShareResponse,
  SubmitResponse,
} from '../../shared/api';
import type { Shot } from '../../shared/puzzle';
import { onReddit } from './platform';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const readError = async (res: Response): Promise<string> => {
  try {
    const j: unknown = await res.json();
    if (
      typeof j === 'object' &&
      j !== null &&
      'message' in j &&
      typeof j.message === 'string'
    )
      return j.message;
  } catch {
    /* ignore */
  }
  return `HTTP ${res.status}`;
};

const call = async <T>(path: string, body?: unknown): Promise<T> => {
  if (!onReddit()) {
    // local preview harness only — never reached on Reddit
    const mock = await import('./mock');
    return mock.mockCall<T>(path, body);
  }
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) throw new ApiError(res.status, await readError(res));
  return (await res.json()) as T;
};

export const api = {
  init: () => call<InitResponse>('/api/init'),
  fire: (port: number) => call<FireResponse>('/api/fire', { port }),
  borrow: (port: number) => call<FireResponse>('/api/borrow', { port }),
  submit: (buoys: number[], shots?: Shot[]) =>
    call<SubmitResponse>('/api/submit', shots ? { buoys, shots } : { buoys }),
  share: () => call<ShareResponse>('/api/share', {}),
  subscribe: () => call<{ ok: boolean }>('/api/subscribe', {}),
  practice: () => call<PracticeResponse>('/api/practice'),
  practiceLog: (rocks: number[], ports: number[]) =>
    call<PracticeLogResponse>('/api/practice/log', { rocks, ports }),
};
