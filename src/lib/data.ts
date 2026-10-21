import fs from 'node:fs';
import path from 'node:path';
import { getAllOrgs, type OrgSnapshot } from './orgs';

export interface SkillAnalysis {
  name: string;
  repo: string;
  stars: number;
  verdict: string;
  problem: string;
  mechanism: string[];
  constraints: string[];
  takeaway: string[];
  limits: string[];
}

export interface UserSnapshot {
  schema_version: string;
  snapshot: {
    date: string;
    timezone: string;
    method: string;
    caveat: string;
  };
  profile: {
    login: string;
    name: string;
    bio: string;
    website: string;
    x: string;
    location: string;
    joined: string;
    followers_approx: number | null;
    strategy: 'breadth' | 'depth' | 'hybrid';
    public_repos: number;
    source_repos: number;
    fork_repos: number;
  };
  stats: {
    total_stars_source: number;
    total_stars_all: number;
    median_stars: number;
    ge_1000: number;
    between_100_999: number;
    between_10_99: number;
    lt_10: number;
    no_language: number;
    top4_share: number;
    top1_share: number;
    superpowers_installs_claimed?: number;
  };
  repos: Array<{
    name: string;
    url: string;
    stars: number;
    language: string | null;
    updated_at: string;
    description: string;
    fork: boolean;
    layer?: string;
    category?: string;
  }>;
  skills: {
    catalog?: string;
    count: number;
    layers?: Record<string, number>;
    items: Array<{
      name: string;
      layer: string;
      category: string;
      repo: string;
      subdir: string;
      summary: string;
      keywords: string[];
      version: string;
    }>;
  };
  skill_analyses?: SkillAnalysis[];
  patterns: Array<{
    id: string;
    name: string;
    kind: 'method' | 'technique';
    evidence: string[];
    claim: string;
  }>;
  sources: string[];
}

export function getAllUsers(): UserSnapshot[] {
  const dataDir = path.resolve('src/data');
  if (!fs.existsSync(dataDir)) return [];
  // 非用户数据集：收敛簇、格式采用率、写法研究等
  const NON_USER = new Set(['convergence.json', 'format-adoption.json', 'desc-style.json', 'skill-descriptions.json']);
  const files = fs.readdirSync(dataDir)
    .filter(f => f.endsWith('.json'))
    .filter(f => !NON_USER.has(f));
  // 双保险：只接受带 profile 字段的才是用户快照
  return files
    .map(file => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf-8')) as UserSnapshot;
      } catch {
        return null;
      }
    })
    .filter((x): x is UserSnapshot => !!x && !!(x as any).profile && !!(x as any).stats);
}

export function getUserByLogin(login: string): UserSnapshot | undefined {
  const users = getAllUsers();
  return users.find(u => u.profile.login.toLowerCase() === login.toLowerCase());
}

/** 统一条目：个人创作者 + 平台方 */
export type Entry = {
  kind: 'creator' | 'platform';
  profile: UserSnapshot['profile'] & {
    platform_role?: OrgSnapshot['profile']['platform_role'];
  };
  stats: UserSnapshot['stats'];
  repos: UserSnapshot['repos'];
  skills: UserSnapshot['skills'];
  skill_analyses?: SkillAnalysis[];
  patterns: UserSnapshot['patterns'];
  standards?: OrgSnapshot['standards'];
  snapshot: UserSnapshot['snapshot'];
  sources?: string[];
};

/** 创作者 + 平台方，合并成一个列表 */
export function getAllEntries(): Entry[] {
  const creators: Entry[] = getAllUsers().map((u) => ({
    kind: 'creator',
    profile: u.profile,
    stats: u.stats,
    repos: u.repos,
    skills: u.skills,
    skill_analyses: u.skill_analyses,
    patterns: u.patterns,
    snapshot: u.snapshot,
    sources: u.sources,
  }));

  const platforms: Entry[] = getAllOrgs().map((o) => ({
    kind: 'platform',
    profile: { ...o.profile, strategy: 'hybrid' as const },
    stats: o.stats,
    repos: o.repos,
    skills: o.skills,
    skill_analyses: o.skill_analyses,
    patterns: o.patterns,
    standards: o.standards,
    snapshot: o.snapshot,
    sources: o.sources,
  }));

  return [...creators, ...platforms].sort(
    (a, b) => b.stats.total_stars_source - a.stats.total_stars_source
  );
}

export function getEntryByLogin(login: string): Entry | undefined {
  return getAllEntries().find((e) => e.profile.login.toLowerCase() === login.toLowerCase());
}

export function getAllPatterns(): Array<{
  id: string;
  name: string;
  kind: 'method' | 'technique';
  evidence: string[];
  claim: string;
  userLogin: string;
  userName: string;
}> {
  const users = getAllUsers();
  const all: Array<any> = [];
  for (const user of users) {
    if (user.patterns) {
      for (const p of user.patterns) {
        all.push({
          ...p,
          userLogin: user.profile.login,
          userName: user.profile.name,
        });
      }
    }
  }
  return all;
}
