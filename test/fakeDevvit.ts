/**
 * In-memory stand-in for `@devvit/web/server` so the real Hono routes and rollover
 * logic can be exercised end-to-end in vitest. Only implements what the app uses.
 */

type Ctx = {
  postId: string | undefined;
  userId: string | undefined;
  username: string | undefined;
  subredditName: string;
  appSlug: string;
  postData: Record<string, unknown> | undefined;
};

/** pre-approval Reddit runs user actions as the app account for non-owners */
export const fakeReddit = { userActionsAsApp: false };

export const context: Ctx = {
  postId: undefined,
  userId: undefined,
  username: undefined,
  subredditName: 'Fogbound',
  appSlug: 'fogbound',
  postData: undefined,
};

const strings = new Map<string, string>();
const hashes = new Map<string, Map<string, string>>();
const zsets = new Map<string, Map<string, number>>();

const h = (k: string) => {
  let m = hashes.get(k);
  if (!m) hashes.set(k, (m = new Map()));
  return m;
};
const z = (k: string) => {
  let m = zsets.get(k);
  if (!m) zsets.set(k, (m = new Map()));
  return m;
};

export const resetFake = () => {
  fakeReddit.userActionsAsApp = false;
  strings.clear();
  hashes.clear();
  zsets.clear();
  posts.clear();
  comments.length = 0;
  flairs.clear();
  postSeq = 0;
};

export const redis = {
  get: async (k: string) => strings.get(k),
  set: async (
    k: string,
    v: string,
    o?: { nx?: boolean; expiration?: Date }
  ) => {
    if (o?.nx && strings.has(k)) return '';
    strings.set(k, v);
    return 'OK';
  },
  del: async (...keys: string[]) => {
    for (const k of keys) {
      strings.delete(k);
      hashes.delete(k);
      zsets.delete(k);
    }
  },
  expire: async () => undefined,
  incrBy: async (k: string, n: number) => {
    const v = Number(strings.get(k) ?? 0) + n;
    strings.set(k, String(v));
    return v;
  },
  hGet: async (k: string, f: string) => hashes.get(k)?.get(f),
  hSet: async (k: string, fv: Record<string, string>) => {
    const m = h(k);
    let added = 0;
    for (const [f, v] of Object.entries(fv)) {
      if (!m.has(f)) added++;
      m.set(f, v);
    }
    return added;
  },
  hSetNX: async (k: string, f: string, v: string) => {
    const m = h(k);
    if (m.has(f)) return 0;
    m.set(f, v);
    return 1;
  },
  hDel: async (k: string, fields: string[]) => {
    let n = 0;
    for (const f of fields) if (hashes.get(k)?.delete(f)) n++;
    return n;
  },
  hMGet: async (k: string, fields: string[]) =>
    fields.map((f) => hashes.get(k)?.get(f) ?? null),
  hGetAll: async (k: string) => Object.fromEntries(hashes.get(k) ?? new Map()),
  hIncrBy: async (k: string, f: string, n: number) => {
    const m = h(k);
    const v = Number(m.get(f) ?? 0) + n;
    m.set(f, String(v));
    return v;
  },
  zAdd: async (k: string, ...members: { member: string; score: number }[]) => {
    for (const { member, score } of members) z(k).set(member, score);
    return members.length;
  },
  zIncrBy: async (k: string, member: string, n: number) => {
    const m = z(k);
    const v = (m.get(member) ?? 0) + n;
    m.set(member, v);
    return v;
  },
  zScore: async (k: string, member: string) => zsets.get(k)?.get(member),
  zRange: async (
    k: string,
    start: number,
    stop: number,
    o?: { reverse?: boolean }
  ) => {
    const all = [...(zsets.get(k) ?? new Map<string, number>())].map(
      ([member, score]) => ({ member, score })
    );
    all.sort((a, b) => (o?.reverse ? b.score - a.score : a.score - b.score));
    return all.slice(start, stop < 0 ? undefined : stop + 1);
  },
};

type FakePost = {
  id: string;
  title: string;
  postData: unknown;
  stickied: boolean;
};
const posts = new Map<string, FakePost>();
export const comments: {
  id: string;
  postId: string;
  parentId: string;
  body: string;
  author: string;
  score: number;
  distinguished: boolean;
}[] = [];
export const flairs = new Map<string, string>();
let postSeq = 0;

export const fakePosts = posts;

export const addUserComment = (
  postId: string,
  author: string,
  body: string,
  score: number
) => {
  comments.push({
    id: `t1_u${comments.length}`,
    postId,
    parentId: postId,
    body,
    author,
    score,
    distinguished: false,
  });
};

const postObj = (p: FakePost) => ({
  id: p.id,
  sticky: async () => {
    p.stickied = true;
  },
  unsticky: async () => {
    p.stickied = false;
  },
});

export const reddit = {
  getCurrentUsername: async () => context.username,
  setUserFlair: async (o: { username: string; text: string }) => {
    flairs.set(o.username, o.text);
  },
  submitCustomPost: async (o: { title: string; postData?: unknown }) => {
    const p: FakePost = {
      id: `t3_p${++postSeq}`,
      title: o.title,
      postData: o.postData,
      stickied: false,
    };
    posts.set(p.id, p);
    return postObj(p);
  },
  getPostById: async (id: string) => {
    const p = posts.get(id);
    if (!p) throw new Error('no post');
    return postObj(p);
  },
  submitComment: async (o: { id: string; text: string; runAs?: string }) => {
    const c = {
      id: `t1_c${comments.length}`,
      postId: o.id,
      parentId: o.id,
      body: o.text,
      author:
        o.runAs === 'USER' && !fakeReddit.userActionsAsApp
          ? (context.username ?? 'anon')
          : context.appSlug,
      score: 1,
      distinguished: false,
    };
    comments.push(c);
    return {
      authorId:
        c.author === context.appSlug ? 't2_app' : (context.userId ?? 't2_anon'),
      distinguish: async () => {
        c.distinguished = true;
      },
      edit: async (e: { text: string }) => {
        c.body = e.text;
      },
    };
  },
  getComments: (o: { postId: string }) => ({
    all: async () =>
      comments
        .filter((c) => c.postId === o.postId)
        .map((c) => ({
          parentId: c.parentId,
          authorName: c.author,
          body: c.body,
          score: c.score,
        })),
  }),
  subscribeToCurrentSubreddit: async () => undefined,
};
