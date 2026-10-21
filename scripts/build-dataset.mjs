// 从候选仓库清单 + 分析结果构建完整的 <user>.json 数据集
// 用法：node scripts/build-dataset.mjs <user> <analysisFile> <reposFile> <profileJson>
import fs from 'node:fs';
import path from 'node:path';

const [user, analysisFile, reposFile, profileFile] = process.argv.slice(2);
if (!user || !analysisFile || !reposFile || !profileFile) {
  console.error('usage: node build-dataset.mjs <user> <analysis> <repos> <profile>');
  process.exit(1);
}

const analysis = JSON.parse(fs.readFileSync(analysisFile, 'utf-8'));
const rawRepos = JSON.parse(fs.readFileSync(reposFile, 'utf-8'));
const profile = JSON.parse(fs.readFileSync(profileFile, 'utf-8'));

// 仓库分类映射（人工判定，命中不了就落到 other）
const CATEGORY_RULES = [
  [/skill/i, 'skill', 'Skill'],
  [/mcp|agent|claude|codex|prompt|grok|chatgpt/i, 'tool', 'Agent 与工具'],
  [/memory|note|obsidian/i, 'tool', '记忆与知识'],
  [/video|youtube|tts|audio/i, 'tool', '音视频处理'],
  [/design|image|logo|icon|ppt|slide|visual/i, 'tool', '设计与视觉'],
  [/pdf|docx|html|md|doc/i, 'tool', '文档处理'],
  [/crawl|search|fetch|scrape|reader/i, 'tool', '信息获取'],
  [/app|client|desktop|gui|web/i, 'app', '应用与客户端'],
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
    url: `https://github.com/${user}/${r.name}`,
    stars: Number(r.stars) || 0,
    language: r.language || null,
    updated_at: r.updated_at,
    description: r.description || '',
    fork: !!r.fork,
    layer: r.fork ? 'fork' : layer,
    category: r.fork ? '外部 Fork' : category,
  };
});

// fork 仓库可能没在抓取结果里区分，额外统计
const own = repos.filter(r => !r.fork);
const forks = repos.filter(r => r.fork);
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

// patterns 的 id 统一成 P1 形式
const patterns = analysis.patterns.map((p, i) => ({
  id: /^P\d+$/i.test(p.id) ? p.id.toUpperCase() : `P${i + 1}`,
  name: p.name,
  kind: p.kind,
  evidence: p.evidence,
  claim: p.claim,
}));

const doc = {
  schema_version: '1.1',
  snapshot: {
    date: '2026-10-21',
    timezone: 'Asia/Shanghai',
    method: `GitHub 用户页 HTML 抓取（type=source）+ raw README/SKILL.md；来源：司徒K《2026年X上最值得关注的120个中文博主》`,
    caveat: 'Star 为 HTML 快照；followers 与 joined 未取到，留空；skill 行为描述来自仓库文档与作者自述，未独立复现',
  },
  profile: {
    login: user,
    name: profile.name,
    bio: profile.bio,
    website: profile.website || '',
    x: profile.x || '',
    location: '',
    joined: '',
    followers_approx: null,
    strategy: profile.strategy,
    public_repos: repos.length,
    source_repos: own.length,
    fork_repos: forks.length,
  },
  stats,
  repos,
  skills: {
    catalog: profile.catalog || `https://github.com/${user}`,
    count: analysis.skills.items.length,
    layers: analysis.skills.items.reduce((acc, s) => {
      acc[s.layer] = (acc[s.layer] || 0) + 1;
      return acc;
    }, {}),
    items: analysis.skills.items.map(s => ({
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
  skill_analyses: analysis.analyses,
  patterns,
  sources: profile.sources || [
    `https://github.com/${user}`,
    `https://github.com/${user}?tab=repositories`,
    'https://x.com/i/article/2112025642464399360',
  ],
};

const outDir = 'D:\\Obsidian\\MyVault\\5-Git用户分析\\_data';
fs.mkdirSync(path.join(outDir, '_analyses'), { recursive: true });
const outFile = path.join(outDir, `${user}.json`);
fs.writeFileSync(outFile, JSON.stringify(doc, null, 2), 'utf-8');

// 拆解卡单独存一份侧写文件
const analysesFile = path.join(outDir, '_analyses', `${user}.analyses.json`);
fs.writeFileSync(analysesFile, JSON.stringify({ schema_version: '1.1', user, analyses: analysis.analyses }, null, 2), 'utf-8');

console.log(`${user}: repos=${repos.length} own=${own.length} forks=${forks.length} stars=${sum} median=${median} top4=${doc.stats.top4_share}% analyses=${analysis.analyses.length} patterns=${patterns.length}`);
