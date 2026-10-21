// 构建组织型资产数据集（与个人创作者分开存放）
// 用法：node scripts/build-org-dataset.mjs <org> <analysisFile> <reposFile>
import fs from 'node:fs';
import path from 'node:path';

const [org, analysisFile, reposFile] = process.argv.slice(2);
const raw = JSON.parse(fs.readFileSync(analysisFile, 'utf-8'));
const rawRepos = JSON.parse(fs.readFileSync(reposFile, 'utf-8'));

const CATEGORY_RULES = [
  [/skill/i, 'skill', '官方 Skill 集'],
  [/plugin|marketplace/i, 'skill', '插件市场'],
  [/mcp|ext/i, 'skill', '协议扩展点'],
  [/agent/i, 'tool', 'Agent 运行时'],
  [/sdk/i, 'tool', 'SDK'],
  [/prompt/i, 'tool', '提示词'],
  [/doc|guide|tutorial|cookbook/i, 'other', '文档与教程'],
];

function categorize(name, description) {
  const text = `${name} ${description || ''}`;
  for (const [re, layer, category] of CATEGORY_RULES) {
    if (re.test(text)) return { layer, category };
  }
  return { layer: 'other', category: '其他' };
}

const repos = rawRepos.map(r => {
  const { layer, category } = categorize(r.name, r.description);
  return {
    name: r.name,
    url: r.url,
    stars: Number(r.stars) || 0,
    language: r.language || null,
    updated_at: r.updated_at,
    description: r.description || '',
    fork: !!r.fork,
    layer: r.fork ? 'fork' : layer,
    category: r.fork ? '外部 Fork' : category,
  };
});

const own = repos.filter(r => !r.fork);
const stars = own.map(r => r.stars).sort((a, b) => a - b);
const sum = stars.reduce((a, b) => a + b, 0);
const median = stars.length ? stars[Math.floor(stars.length / 2)] : 0;
const top4 = stars.slice(-4).reduce((a, b) => a + b, 0);

const stats = {
  total_stars_source: sum,
  total_stars_all: repos.reduce((a, r) => a + r.stars, 0),
  median_stars: median,
  ge_1000: stars.filter(s => s >= 1000).length,
  between_100_999: stars.filter(s => s >= 100 && s < 1000).length,
  between_10_99: stars.filter(s => s >= 10 && s < 100).length,
  lt_10: stars.filter(s => s < 10).length,
  no_language: own.filter(r => !r.language).length,
  top4_share: sum ? Math.round((top4 / sum) * 1000) / 10 : 0,
  top1_share: sum ? Math.round((stars[stars.length - 1] / sum) * 1000) / 10 : 0,
};

const patterns = (raw.patterns || []).map((p, i) => ({
  id: /^P\d+$/i.test(p.id) ? p.id.toUpperCase() : `P${i + 1}`,
  name: p.name,
  kind: p.kind,
  evidence: p.evidence,
  claim: p.claim,
  counted_in_convergence: false,
}));

const doc = {
  schema_version: '1.1',
  kind: 'organization',
  snapshot: {
    date: '2026-10-21',
    timezone: 'Asia/Shanghai',
    method: 'GitHub REST API（认证）抓取 org 仓库 + 官方 README 原文',
    caveat: '平台方供给，pattern 不参与跨作者收敛判定；星数为组织整体，不代表单个 skill 的采用度',
  },
  profile: {
    login: org,
    name: raw.profile.name,
    bio: raw.profile.bio,
    website: raw.profile.website || '',
    x: raw.profile.x || '',
    location: '',
    joined: '',
    followers_approx: null,
    strategy: 'platform',
    platform_role: raw.profile.platform_role,
    public_repos: repos.length,
    source_repos: own.length,
    fork_repos: repos.length - own.length,
  },
  stats,
  repos,
  skills: {
    catalog: `https://github.com/${org}`,
    count: raw.skills.items.length,
    layers: raw.skills.items.reduce((acc, s) => {
      acc[s.layer] = (acc[s.layer] || 0) + 1;
      return acc;
    }, {}),
    items: raw.skills.items.map(s => ({
      name: s.name,
      layer: s.layer,
      category: s.category,
      repo: s.repo,
      subdir: '',
      summary: s.summary,
      keywords: [],
      version: '',
    })),
  },
  skill_analyses: raw.analyses,
  patterns,
  standards: raw.standards || [],
  sources: [
    `https://github.com/${org}`,
    'https://github.com/orgs/anthropics/repos',
    'https://x.com/i/article/2112025642464399360',
  ],
};

const outDir = 'D:\\Obsidian\\MyVault\\5-Git用户分析\\_data\\orgs';
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `${org}.json`), JSON.stringify(doc, null, 2), 'utf-8');

// 拆解卡侧写文件
const analysesDir = path.join('D:\\Obsidian\\MyVault\\5-Git用户分析\\_data\\_analyses', '_orgs');
fs.mkdirSync(analysesDir, { recursive: true });
fs.writeFileSync(
  path.join(analysesDir, `${org}.analyses.json`),
  JSON.stringify({ schema_version: '1.1', user: org, analyses: raw.analyses }, null, 2),
  'utf-8'
);

console.log(`${org}: repos=${repos.length} own=${own.length} forks=${repos.length - own.length} stars=${sum} median=${median} analyses=${raw.analyses.length} patterns=${patterns.length} standards=${(raw.standards || []).length}`);
