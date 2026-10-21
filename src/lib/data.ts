import fs from 'node:fs';
import path from 'node:path';

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
  const files = fs.readdirSync(dataDir)
    .filter(f => f.endsWith('.json'))
    // convergence.json 是收敛簇数据，不是用户数据集
    .filter(f => f !== 'convergence.json');
  return files.map(file => {
    const raw = fs.readFileSync(path.join(dataDir, file), 'utf-8');
    return JSON.parse(raw) as UserSnapshot;
  });
}

export function getUserByLogin(login: string): UserSnapshot | undefined {
  const users = getAllUsers();
  return users.find(u => u.profile.login.toLowerCase() === login.toLowerCase());
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
