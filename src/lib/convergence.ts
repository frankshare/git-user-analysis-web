import fs from 'node:fs';
import path from 'node:path';

export interface ConvergenceCluster {
  id: string;
  name: string;
  summary: string;
  why_it_matters: string;
  members: Array<{
    user: string;
    pattern: string;
    evidence: string;
    mechanism: string;
  }>;
  verdict: string;
  actionable: string;
}

export interface ConvergenceData {
  schema_version: string;
  note: string;
  snapshot: { date: string; users_analyzed: number; patterns_total: number };
  clusters: ConvergenceCluster[];
  stats: {
    users_analyzed: number;
    patterns_total: number;
    methods: number;
    techniques: number;
    analyses_total: number;
    skills_total: number;
    clusters: number;
    max_cluster_members: number;
  };
  methodology: string;
}

export function getConvergence(): ConvergenceData | null {
  const file = path.resolve('src/data/convergence.json');
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as ConvergenceData;
}
