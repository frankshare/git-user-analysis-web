import fs from 'node:fs';
import path from 'node:path';

export interface OrgSnapshot {
  schema_version: string;
  kind: 'organization';
  snapshot: { date: string; timezone: string; method: string; caveat: string };
  profile: {
    login: string;
    name: string;
    bio: string;
    website: string;
    x: string;
    strategy: 'platform';
    platform_role: 'harness_vendor' | 'standard_setter' | 'community_hub';
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
  };
  repos: Array<{
    name: string; url: string; stars: number; language: string | null;
    updated_at: string; description: string; fork: boolean; layer: string; category: string;
  }>;
  skills: {
    catalog: string;
    count: number;
    layers: Record<string, number>;
    items: Array<{
      name: string; layer: string; category: string; repo: string;
      subdir: string; summary: string; keywords: string[]; version: string;
    }>;
  };
  skill_analyses: Array<{
    name: string; repo: string; stars: number; verdict: string; problem: string;
    mechanism: string[]; constraints: string[]; takeaway: string[]; limits: string[];
  }>;
  patterns: Array<{
    id: string; name: string; kind: 'method' | 'technique';
    evidence: string[]; claim: string; counted_in_convergence: false;
  }>;
  standards: Array<{
    name: string; what: string; evidence: string; adopted_by: string;
  }>;
  sources: string[];
}

export function getAllOrgs(): OrgSnapshot[] {
  const dir = path.resolve('src/data/orgs');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as OrgSnapshot)
    .sort((a, b) => b.stats.total_stars_source - a.stats.total_stars_source);
}

export const ROLE_LABELS: Record<string, { label: string; desc: string; color: string }> = {
  harness_vendor: {
    label: '运行时提供方',
    desc: 'Agent 运行时的提供方，其 skill 定义标准格式',
    color: 'indigo',
  },
  standard_setter: {
    label: '协议标准制定方',
    desc: '协议标准的制定方，其扩展点定义互操作方式',
    color: 'emerald',
  },
  community_hub: {
    label: '社区聚合平台',
    desc: '社区聚合 / 市场平台，收录第三方作品',
    color: 'amber',
  },
};
