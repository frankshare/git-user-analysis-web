param(
  [Parameter(Mandatory = $true)][string]$Path
)

# 校验分析 JSON 是否符合 schema v1.0，并复核聚合指标。
# 用法：pwsh -File validate_schema.ps1 -Path ..\..\_data\alchaincyf.json

$ErrorActionPreference = 'Stop'
$errors = New-Object System.Collections.Generic.List[string]
$j = Get-Content -Path $Path -Raw | ConvertFrom-Json

foreach ($k in @('schema_version', 'snapshot', 'profile', 'stats', 'repos', 'skills', 'patterns', 'sources')) {
  if (-not $j.PSObject.Properties.Name.Contains($k)) { $errors.Add("缺少顶层字段：$k") }
}
if ($errors.Count -gt 0) { $errors | ForEach-Object { Write-Error $_ }; exit 1 }

$repos = @($j.repos)
$own = @($repos | Where-Object { -not $_.fork })
$stars = @($own | ForEach-Object { [int]$_.stars } | Sort-Object)
$sum = ($stars | Measure-Object -Sum).Sum
$median = $stars[[math]::Floor($stars.Count / 2)]
$top4 = ($stars | Select-Object -Last 4 | Measure-Object -Sum).Sum
$top4Share = [math]::Round(($top4 / $sum) * 100, 1)
$noLang = @($own | Where-Object { -not $_.language }).Count

if ($repos.Count -ne ($j.profile.source_repos + $j.profile.fork_repos)) {
  $errors.Add("仓库数与 profile 不一致：$($repos.Count) != $($j.profile.source_repos)+$($j.profile.fork_repos)")
}
if ($sum -ne $j.stats.total_stars_source) {
  $errors.Add("总 star 不一致：重算 $sum，JSON $($j.stats.total_stars_source)")
}
if ($median -ne $j.stats.median_stars) {
  $errors.Add("中位数不一致：重算 $median，JSON $($j.stats.median_stars)")
}
if ($top4Share -ne $j.stats.top4_share) {
  $errors.Add("top4 占比不一致：重算 $top4Share，JSON $($j.stats.top4_share)")
}
if ($noLang -ne $j.stats.no_language) {
  $errors.Add("无语言仓库数不一致：重算 $noLang，JSON $($j.stats.no_language)")
}
foreach ($p in $j.patterns) {
  if (-not $p.kind) { $errors.Add("模式 $($p.id) 缺少 kind（method/technique）") }
  if ($p.kind -eq 'method' -and @($p.evidence).Count -lt 3) {
    $errors.Add("方法 $($p.id) 证据少于 3 条")
  }
  if ($p.kind -eq 'technique' -and @($p.evidence).Count -lt 1) {
    $errors.Add("技巧 $($p.id) 没有证据")
  }
}

# 时间必须是 ISO 8601（ConvertFrom-Json 会把 ISO 转成 DateTime，写回前不归一化就会漂成本地格式）
$raw = Get-Content -Path $Path -Raw
$stamps = [regex]::Matches($raw, '"updated_at":\s*"([^"]*)"')
foreach ($m in $stamps) {
  if ($m.Groups[1].Value -notmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$') {
    $errors.Add("updated_at 非 ISO 8601：$($m.Groups[1].Value)")
  }
}

if ($j.profile.strategy -notin @('breadth', 'depth', 'hybrid')) {
  $errors.Add("profile.strategy 必须是 breadth / depth / hybrid，当前：$($j.profile.strategy)")
}

# ---- schema v1.1：skill_analyses 五问拆解卡 ----
$ANALYSIS_FIELDS = @('name', 'repo', 'stars', 'verdict', 'problem', 'mechanism', 'constraints', 'takeaway', 'limits')
if ($j.PSObject.Properties.Name.Contains('skill_analyses')) {
  $analyses = @($j.skill_analyses)
  if ($analyses.Count -eq 0) {
    $errors.Add("skill_analyses 为空数组")
  }
  $seenNames = @{}
  foreach ($a in $analyses) {
    foreach ($f in $ANALYSIS_FIELDS) {
      if (-not $a.PSObject.Properties.Name.Contains($f)) { $errors.Add("拆解卡 $($a.name) 缺少字段：$f") }
    }
    if ($a.name -and $seenNames.ContainsKey($a.name)) {
      $errors.Add("拆解卡重名：$($a.name)")
    }
    if ($a.name) { $seenNames[$a.name] = $true }

    if ($a.problem -and $a.problem.Length -lt 10) { $errors.Add("拆解卡 $($a.name) 的「解决什么」过短") }
    if (@($a.mechanism).Count -lt 2) { $errors.Add("拆解卡 $($a.name) 的「核心机制」少于 2 条") }
    if (@($a.constraints).Count -lt 1) { $errors.Add("拆解卡 $($a.name) 缺少「工程约束」") }
    if (@($a.takeaway).Count -lt 1) { $errors.Add("拆解卡 $($a.name) 缺少「可搬走」") }
    if (@($a.limits).Count -lt 1) { $errors.Add("拆解卡 $($a.name) 缺少「局限」——这是硬性要求") }
    if ($a.verdict -and $a.verdict -match '优秀|很好用|值得学习|非常') {
      $errors.Add("拆解卡 $($a.name) 的定性含无法验收的评价：$($a.verdict)")
    }
  }
  # 拆解卡的 stars 必须与 repos 中的实际值一致
  foreach ($a in $analyses) {
    $repo = @($own | Where-Object { $_.name -eq $a.repo })
    if ($repo.Count -eq 1 -and $a.stars -ne $repo[0].stars) {
      $errors.Add("拆解卡 $($a.name) 的 stars 与仓库不一致：$($a.stars) != $($repo[0].stars)")
    }
  }
} elseif ($j.schema_version -like '1.1*') {
  $errors.Add("schema_version $($j.schema_version) 要求存在 skill_analyses 字段")
}

Write-Output ("repos={0} source={1} stars={2} median={3} top4={4}% noLang={5} patterns={6} analyses={7}" -f `
    $repos.Count, $own.Count, $sum, $median, $top4Share, $noLang, @($j.patterns).Count, @($j.skill_analyses).Count)

if ($errors.Count -gt 0) {
  Write-Output "--- FAIL ---"
  $errors | ForEach-Object { Write-Output "x $_" }
  exit 1
}
Write-Output "OK: schema $($j.schema_version) 校验通过"
