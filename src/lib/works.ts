import fs from 'node:fs';
import path from 'node:path';
import { getAllUsers } from './data';
import { hasCjk, toNum } from './people';

export interface Work {
  name: string;
  url: string;
  stars: number;
  lang: string;
  layer: string;
  cat: string;
  desc: string;
  updated: string;
  author: string;
  authorName: string;
  zh: boolean;
  note: string;
  audience: string;
  /** 最终归类（人工优先） */
  group: string;
}

/** 一级分类：把细的 layer 归到大类，避免十几个碎标签 */
export const LAYER_GROUP: Record<string, string> = {
  skill: 'Skill 与知识库',
  persona: 'Skill 与知识库',
  catalog: 'Skill 与知识库',
  book: 'Skill 与知识库',
  tool: '工具与库',
  framework: '工具与库',
  app: '应用与客户端',
  profile: '应用与客户端',
  ecosystem: '生态与集成',
  research: '研究与写作',
  writing: '研究与写作',
  other: '其他',
};

export const GROUP_ORDER = [
  'Skill 与知识库',
  '工具与库',
  '应用与客户端',
  '生态与集成',
  '研究与写作',
  '其他',
];

/** 分类的 URL slug（中文名不适合做路径） */
export const GROUP_SLUG: Record<string, string> = {
  'Skill 与知识库': 'skills',
  '工具与库': 'tools',
  '应用与客户端': 'apps',
  '生态与集成': 'ecosystem',
  '研究与写作': 'writing',
  '其他': 'others',
};

/** 每类的视觉标识（图标字 + 强调色） */
export const GROUP_META: Record<string, { mark: string; accent: string; blurb: string }> = {
  'Skill 与知识库': {
    mark: 'Skill',
    accent: '#4a6b4e',
    blurb: '可被 Agent 加载的知识与技能——方法论、人格、目录与书',
  },
  '工具与库': {
    mark: 'Tool',
    accent: '#3f5a72',
    blurb: '开发工具、脚手架、配置预设——干活用的家伙',
  },
  '应用与客户端': {
    mark: 'App',
    accent: '#a9722a',
    blurb: '能装在桌面上的东西——客户端、扩展、桌面应用',
  },
  '生态与集成': {
    mark: 'Ecos',
    accent: '#6d4a5c',
    blurb: '把外部接进来的那层——协议、扩展点、打包格式',
  },
  '研究与写作': {
    mark: 'Paper',
    accent: '#8c5c20',
    blurb: '长文、教程、橙皮书——把方法写成能读的东西',
  },
  '其他': {
    mark: 'Misc',
    accent: '#6f6453',
    blurb: '难以归类的小仓库长尾：站点、配置、各类小工具',
  },
};

const CONTENT_HINT = [
  'blog', 'site', 'docs', 'doc', 'note', 'talk', 'wiki', 'book', 'readme', 'resume', 'cv',
  'homepage', 'website', 'post', 'article', 'slide', 'deck', 'paper', 'writing',
  'dotfile', 'config', 'setup', 'homebrew', 'tap', 'shell', 'awesome', 'list',
];

const isContent = (w: { name: string; desc: string }) => {
  const hay = (w.name + ' ' + w.desc).toLowerCase();
  return CONTENT_HINT.some((k) => hay.includes(k));
};

/** 二级标签：先看用途，再看语言（只对最终归在「其他」组的作品有意义） */
export function subGroup(w: { layer: string; group?: string; name: string; desc: string; lang: string }): string {
  const g = w.group || LAYER_GROUP[w.layer] || '其他';
  if (g !== '其他') return '';
  if (isContent(w)) return '站点与内容';
  if (/^(dotfiles?$|homebrew|\.github|setup|config)/i.test(w.name)) return '配置与环境';
  return w.lang && w.lang !== '—' ? `${w.lang} 小工具` : '零散小工具';
}

function readJson<T>(rel: string, fallback: T): T {
  const file = path.resolve('src/data', rel);
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

export function loadWorks(): Work[] {
  const users = getAllUsers();
  const notes = readJson<Record<string, Record<string, string>>>('work-notes.json', {});
  const audience = readJson<Record<string, Record<string, string>>>('work-audience.json', {});
  // 人工归类：layer/category 字段缺失的高星作品（>=300 星）由人工判定
  const manual = readJson<{ items: Record<string, string> }>('work-groups.json', { items: {} });

  const works: Work[] = users
    .flatMap((u) => {
      const sample = (u.repos || []).filter((r) => !r.fork).slice(0, 20);
      const zhRatio = sample.length
        ? sample.filter((r) => hasCjk(r.description || '')).length / sample.length
        : 0;
      const zh = hasCjk(u.profile.name || '') || zhRatio >= 0.25;
      return (u.repos || [])
        .filter((r) => !r.fork)
        .map((r) => {
          const name = r.name;
          return {
            name,
            url: r.url,
            stars: toNum(r.stars),
            lang: r.language || '—',
            layer: (r as any).layer || 'other',
            cat: (r as any).category || '',
            desc: r.description || '',
            updated: (r.updated_at || '').slice(0, 10),
            author: u.profile.login,
            authorName: u.profile.name || u.profile.login,
            zh,
            note: notes[u.profile.login]?.[name] || '',
            audience: audience[u.profile.login]?.[name] || '',
            group: manual.items[`${u.profile.login}|${name}`] || '',
          } as Work;
        });
    })
    .sort((a, b) => b.stars - a.stars);

  return works;
}

export function groupOf(w: Work): string {
  if (w.group) return w.group;
  return LAYER_GROUP[w.layer] ?? '其他';
}

export function groupStats(works: Work[]) {
  return GROUP_ORDER.map((name) => {
    const items = works
      .filter((w) => groupOf(w) === name)
      .sort((a, b) => {
        const na = a.note ? 1 : 0;
        const nb = b.note ? 1 : 0;
        return nb - na || b.stars - a.stars;
      });
    const cats = new Map<string, number>();
    for (const w of items) {
      const c = w.cat || '未分类';
      cats.set(c, (cats.get(c) || 0) + 1);
    }
    const subs = new Map<string, Work[]>();
    for (const w of items) {
      const k = subGroup(w);
      if (!k) continue;
      if (!subs.has(k)) subs.set(k, []);
      subs.get(k)!.push(w);
    }
    const authors = new Set(items.map((w) => w.author));
    return {
      name,
      slug: GROUP_SLUG[name],
      meta: GROUP_META[name],
      items,
      count: items.length,
      stars: items.reduce((a, w) => a + w.stars, 0),
      authors: authors.size,
      noted: items.filter((w) => w.note).length,
      top: [...cats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
      subs: [...subs.entries()]
        .map(([name2, ws]) => ({
          name: name2,
          count: ws.length,
          stars: ws.reduce((a, w) => a + w.stars, 0),
        }))
        .sort((a, b) => b.count - a.count),
    };
  }).filter((g) => g.count > 0);
}

export const kfmt = (n: number) =>
  n >= 10000 ? `${(n / 10000).toFixed(1).replace('.0', '')}w` : n.toLocaleString('en-US');
