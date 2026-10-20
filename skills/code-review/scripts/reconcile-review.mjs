#!/usr/bin/env node
// Reconcile reviewer output into one confidence-gated review.
//
// Reads plan.json plus every findings/*.json produced by the reviewer agents,
// drops low-confidence and pre-existing findings, deduplicates, ranks by
// severity, writes the markdown report and result.json (the artifact the
// opencode-code-review plugin gate reads).
//
// Usage:
//   node reconcile-review.mjs [--plan <plan.json>] [--findings <dir>]
//                             [--report <file.md>] [--threshold 80]
//                             [--max-findings 32|all] [--author <model>]
//                             [--reviewer <model>] [--level standard]
//
// Exit 2 when the reviewers produced no findings file at all (a failed review
// must never look like a clean one).

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import {
  SEVERITY_RANK,
  gitDir,
  isoDay,
  normalizeSeverity,
  parseDiff,
  readJson,
  redact,
} from "./lib.mjs";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--plan") out.plan = argv[++i];
    else if (a === "--findings") out.findings = argv[++i];
    else if (a === "--report") out.report = argv[++i];
    else if (a === "--threshold") out.threshold = Number(argv[++i]);
    else if (a === "--max-findings") {
      const value = argv[++i];
      out.maxFindings = String(value).toLowerCase() === "all" ? Infinity : Number(value);
    } else if (a === "--author") out.author = argv[++i];
    else if (a === "--reviewer") out.reviewer = argv[++i];
    else if (a === "--level") out.level = argv[++i];
    else if (a === "--expected") out.expected = Number(argv[++i]);
  }
  return out;
}

function fail(message, extra = {}) {
  console.error(JSON.stringify({ error: message, ...extra }, null, 2));
  process.exit(2);
}

function docsBase(cwd) {
  const siteMarkers = [
    "docusaurus.config.js",
    "docusaurus.config.ts",
    "docusaurus.config.mjs",
    "mkdocs.yml",
    "astro.config.mjs",
    "astro.config.ts",
    "next.config.js",
    "next.config.mjs",
  ];
  const isSite =
    siteMarkers.some((m) => existsSync(join(cwd, m))) ||
    existsSync(join(cwd, ".vitepress")) ||
    existsSync(join(cwd, "docs", ".vitepress"));
  return isSite ? ".workflow" : "docs";
}

function normalizeFinding(raw, source) {
  if (!raw || typeof raw !== "object") return null;
  const file = String(raw.file || raw.path || raw.filePath || "").replace(/^\.\//, "");
  const line = Number.parseInt(raw.line ?? raw.startLine ?? raw.lineNumber, 10);
  if (!file || !Number.isFinite(line)) return null;
  const severity = normalizeSeverity(raw.severity);
  const confidence = Math.max(0, Math.min(100, Number.parseInt(raw.confidence, 10)));
  const title = String(raw.title || raw.summary || raw.issue || "").trim();
  if (!title) return null;
  return {
    file,
    line,
    severity,
    confidence: Number.isFinite(confidence) ? confidence : 0,
    category: String(raw.category || raw.dimension || raw.type || "correctness").toLowerCase(),
    title,
    problem: String(raw.problem || raw.description || raw.detail || "").trim(),
    why: String(raw.why || raw.impact || raw.reason || "").trim(),
    fix: String(raw.fix || raw.suggestion || raw.recommendation || "").trim(),
    evidence: String(raw.evidence || "").trim(),
    pass: String(raw.pass || raw.agent || source).trim(),
    source,
  };
}

function loadFindings(dir) {
  if (!existsSync(dir)) fail(`findings directory not found: ${dir}`);
  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".json"));
  if (files.length === 0) fail(`no findings/*.json in ${dir}; the reviewers did not report`);
  const findings = [];
  for (const name of files) {
    const raw = readJson(join(dir, name), null);
    if (!raw) fail(`unreadable findings file: ${join(dir, name)}`);
    const list = Array.isArray(raw) ? raw : raw.findings;
    if (!Array.isArray(list)) fail(`findings file has no findings array: ${join(dir, name)}`);
    for (const item of list) {
      const normalized = normalizeFinding(item, name);
      if (normalized) findings.push(normalized);
    }
  }
  return { findings, fileCount: files.length };
}

function parseLineSets(plan) {
  const map = new Map();
  for (const chunk of plan.chunks || []) {
    let text;
    try {
      text = readFileSync(chunk.diffFile, "utf8");
    } catch {
      continue;
    }
    for (const [file, info] of parseDiff(text)) {
      if (!map.has(file)) map.set(file, new Set());
      for (const line of info.added) map.get(file).add(line);
    }
  }
  return map;
}

function dedupe(findings) {
  const kept = new Map();
  for (const finding of findings) {
    const key = `${finding.file}|${Math.round(finding.line / 4)}|${finding.category}`;
    const existing = kept.get(key);
    if (!existing) {
      kept.set(key, finding);
      continue;
    }
    if (finding.confidence > existing.confidence) {
      kept.set(key, { ...finding, sources: [existing.source, finding.source] });
    } else {
      existing.sources = [...(existing.sources || [existing.source]), finding.source];
    }
  }
  return [...kept.values()];
}

function verdictOf(findings) {
  if (findings.some((f) => f.severity === "blocker")) return "blocked";
  if (findings.some((f) => f.severity === "major")) return "changes-requested";
  if (findings.some((f) => f.severity === "minor" || f.severity === "nit")) return "approve-with-nits";
  return "approve";
}

const SEVERITY_HEADING = {
  blocker: "Blockers",
  major: "Major",
  minor: "Minor",
  nit: "Nits",
};
const SEVERITY_ICON = { blocker: "🔴", major: "🟠", minor: "🟡", nit: "⚪" };

function renderFinding(f) {
  const lines = [`### ${SEVERITY_ICON[f.severity]} ${f.title}`, ""];
  const meta = [`\`${f.file}:${f.line}\``, `category: ${f.category}`, `confidence: ${f.confidence}`];
  // A blocker or major outside the changed lines is kept, so say so: the
  // reader must be able to tell pre-existing findings from diff findings.
  if (f.inDiff === false) meta.push("in-diff: no");
  lines.push(meta.join(" · "), "");
  if (f.problem) lines.push(`**Problem**: ${f.problem}`, "");
  if (f.why) lines.push(`**Why it matters**: ${f.why}`, "");
  if (f.fix) lines.push(`**Suggested fix**: ${f.fix}`, "");
  if (f.evidence) lines.push(`**Evidence**: ${f.evidence}`, "");
  return lines.join("\n").trimEnd();
}

function renderReport({ plan, findings, dropped, verdict, author, reviewer, threshold, level, passedPasses, complete, expected, reported }) {
  const counts = {
    blocker: findings.filter((f) => f.severity === "blocker").length,
    major: findings.filter((f) => f.severity === "major").length,
    minor: findings.filter((f) => f.severity === "minor").length,
    nit: findings.filter((f) => f.severity === "nit").length,
  };
  const total = findings.length;
  const highest = findings[0];

  const summary = total === 0
    ? `No issue survived the confidence gate of ${threshold}. Checked for correctness, security, project conventions, and test adequacy. A clean review is evidence, not proof: it means no high confidence problem was found in the changed lines.`
    : `Found ${counts.blocker} blocker(s), ${counts.major} major, ${counts.minor} minor, ${counts.nit} nit across ${plan.totals.files} changed file(s). Highest severity: ${highest.severity} in \`${highest.file}:${highest.line}\`. The gate kept ${total} finding(s) and dropped ${dropped.total} (${dropped.confidence} below confidence ${threshold}, ${dropped.preExisting} outside the changed lines).`;

  const out = [
    `# Code review: ${plan.branch}, ${isoDay()}`,
    "",
    `**Verdict**: ${verdict}`,
    `**Reviewed by**: ${reviewer} (author model: ${author})`,
    `**Scope**: ${plan.totals.files} files, ${plan.mode} against \`${plan.base}\`, head \`${String(plan.head).slice(0, 8)}\``,
    `**Level**: ${level} · confidence gate ${threshold} · passes: ${passedPasses.join(", ")}`,
    "",
    "## Summary",
    "",
    summary,
    "",
  ];

  if (!complete) {
    out.push(
      "> [!WARNING]",
      `> Incomplete review: ${reported} of ${expected} reviewer agents reported. The missing chunk is unreviewed, so this result is not a clean pass.`,
      "",
    );
  }

  for (const severity of ["blocker", "major", "minor", "nit"]) {
    const group = findings.filter((f) => f.severity === severity);
    if (group.length === 0) continue;
    out.push(`## ${SEVERITY_HEADING[severity]}`, "");
    for (const f of group) out.push(renderFinding(f), "");
  }

  out.push("## Coverage", "");
  out.push(`- Files reviewed: ${plan.totals.files}`);
  out.push(`- Lines changed: +${plan.totals.added} / -${plan.totals.removed}`);
  out.push(`- Skipped files: ${plan.totals.skipped} (lockfiles, generated output, binaries, snapshots)`);
  if (plan.totals.truncatedChunks) {
    out.push(`- Truncated chunks: ${plan.totals.truncatedChunks} (a single hunk exceeded the chunk budget; review that file by hand)`);
  }
  out.push(`- Chunks: ${plan.totals.chunks}`);
  out.push("");

  if (dropped.total > 0) {
    out.push("## Filtered", "");
    out.push(`- Below confidence ${threshold}: ${dropped.confidence}`);
    out.push(`- Pre-existing or outside the changed lines: ${dropped.preExisting}`);
    out.push(`- Duplicates merged: ${dropped.duplicates}`);
    out.push("");
  }

  return out.join("\n").trimEnd() + "\n";
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = resolve(process.cwd());
  const gd = gitDir(cwd);
  if (!gd) fail("not a git repository", { cwd });

  const planPath = args.plan || join(gd, "code-review", "last-plan.json");
  const plan = readJson(planPath, null);
  if (!plan) fail(`plan not found: ${planPath}. Run plan-review.mjs first.`);
  if (plan.empty) fail("the plan is empty; there is nothing to review", { planPath });

  const findingsDir = args.findings || join(plan.planDir, "findings");
  const threshold = Number.isFinite(args.threshold) ? args.threshold : 80;
  const maxFindings = args.maxFindings === Infinity || Number.isFinite(args.maxFindings) ? args.maxFindings : 32;
  const level = args.level || plan.level || "standard";

  const all = loadFindings(findingsDir);
  // Fail closed: a review is complete only when every spawned reviewer wrote a
  // findings file. The plan records how many the level expects; a plan from
  // before that field defaults to two (security + correctness).
  const planAgents = Number.isFinite(plan.agents) && plan.agents > 0
    ? plan.agents
    : plan.level === "quick" ? 1 : 2;
  const expected = Number.isFinite(args.expected) && args.expected > 0 ? args.expected : planAgents;
  const complete = all.fileCount >= expected;
  const lineSets = parseLineSets(plan);

  const passed = [];
  const dropped = { total: 0, confidence: 0, preExisting: 0, duplicates: 0 };

  for (const f of all.findings) {
    const changed = lineSets.get(f.file);
    const onChangedLine = Boolean(changed && changed.has(f.line));
    f.inDiff = onChangedLine;

    if (!Number.isFinite(f.confidence) || f.confidence < threshold) {
      dropped.total += 1;
      dropped.confidence += 1;
      continue;
    }
    if (!onChangedLine && (f.severity === "minor" || f.severity === "nit")) {
      dropped.total += 1;
      dropped.preExisting += 1;
      continue;
    }
    passed.push(f);
  }

  const beforeDedupe = passed.length;
  const deduped = dedupe(passed);
  dropped.duplicates = beforeDedupe - deduped.length;
  dropped.total += dropped.duplicates;

  deduped.sort((a, b) => {
    const s = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    return s !== 0 ? s : b.confidence - a.confidence;
  });
  const findings = deduped.slice(0, maxFindings);
  const overflow = deduped.length - findings.length;

  const verdict = verdictOf(findings);
  const passes = {
    quick: ["correctness"],
    standard: ["correctness", "security", "conventions"],
    deep: ["correctness", "security", "conventions", "tests", "history"],
  }[level] || ["correctness", "security", "conventions"];

  const reportArg = args.report;
  const defaultReport = join(docsBase(cwd), "reviews", `${isoDay()}-${String(plan.branch).replace(/[^a-zA-Z0-9._-]+/g, "-")}.md`);
  const reportPath = resolve(cwd, reportArg || defaultReport);
  mkdirSync(dirname(reportPath), { recursive: true });

  let body = renderReport({
    plan,
    findings,
    dropped,
    verdict,
    author: args.author || "unknown",
    reviewer: args.reviewer || "unknown",
    threshold,
    level,
    passedPasses: passes,
    complete,
    expected,
    reported: all.fileCount,
  });
  if (overflow > 0) {
    body += `\n> ${overflow} further finding(s) were over the ${maxFindings} limit and are not listed. Re-run with --max-findings all for the full set.\n`;
  }
  // The report is a committed artifact, so it gets the same redaction as the
  // PR comment: a secret quoted in a finding must not reach the repository.
  writeFileSync(reportPath, redact(body));

  const result = {
    version: 1,
    head: plan.head,
    base: plan.base,
    mode: plan.mode,
    branch: plan.branch,
    level,
    verdict,
    complete,
    agents: { expected, reported: all.fileCount },
    counts: {
      blocker: findings.filter((f) => f.severity === "blocker").length,
      major: findings.filter((f) => f.severity === "major").length,
      minor: findings.filter((f) => f.severity === "minor").length,
      nit: findings.filter((f) => f.severity === "nit").length,
      total: findings.length,
      dropped: dropped.total,
      overflow,
    },
    reviewer: args.reviewer || "unknown",
    author: args.author || "unknown",
    reportPath,
    reportRelative: relative(cwd, reportPath).replace(/\\/g, "/"),
    planPath,
    createdAt: new Date().toISOString(),
  };

  writeFileSync(join(plan.planDir, "result.json"), JSON.stringify(result, null, 2));
  const stateDir = join(gd, "code-review");
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, "last-result.json"), JSON.stringify(result, null, 2));

  console.log(JSON.stringify({ ...result, findings: findings.map((f) => ({ file: f.file, line: f.line, severity: f.severity, confidence: f.confidence, category: f.category, title: f.title })) }, null, 2));
}

try {
  main();
} catch (error) {
  fail(String(error && error.message ? error.message : error));
}
