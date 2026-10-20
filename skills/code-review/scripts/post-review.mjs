#!/usr/bin/env node
// Post or update the sticky code review comment on a pull request.
//
// One comment per PR, updated in place. This script never creates inline
// review comments: local line numbers do not survive a rebase, and a stale
// inline comment is worse than a link with file:line in a single summary.
//
// Usage:
//   node post-review.mjs [--result <result.json>] [--report <file.md>]
//                        [--pr <number|url>] [--apply] [--require-pr]
//                        [--force]
//
// Default is a dry run that prints the payload it would send.
// Exit 0 when posted, skipped (no PR), or dry run. Exit 3 when --require-pr
// and no PR exists. Exit 1 when gh fails.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gitDir, readJson, redact } from "./lib.mjs";

const MARKER = "<!-- opencode-code-review:v1 -->";
const MAX_BODY = 60000;

function parseArgs(argv) {
  const out = { apply: false, requirePr: false, force: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--result") out.result = argv[++i];
    else if (a === "--report") out.report = argv[++i];
    else if (a === "--pr") out.pr = argv[++i];
    else if (a === "--apply") out.apply = true;
    else if (a === "--require-pr") out.requirePr = true;
    else if (a === "--force") out.force = true;
  }
  return out;
}

function out(value, code = 0) {
  console.log(JSON.stringify(value, null, 2));
  process.exit(code);
}

function gh(args, cwd) {
  return execFileSync("gh", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function gitOutput(args, cwd) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

// A review of the checkout is not stale merely because the reviewed change was
// committed afterwards. `plan-review.mjs` diffs the working tree, so a review
// taken before the commit covers exactly the parent of the pull request head:
// when `rev-parse <prHead>^` is the reviewed commit, the PR adds nothing that
// was not reviewed. Anything else -- a second commit, an unknown or unfetched
// head (shallow clone), a failed git call -- stays stale, so the check can
// only lose freshness, never invent it.
export function reviewFreshness(state, head, cwd = process.cwd()) {
  const reviewed = String((state && state.head) || "");
  const prHead = String(head || "");
  const base = { reviewed, prHead, parent: null };
  if (!reviewed || !prHead) return { ...base, fresh: false, stale: false, via: null };
  if (reviewed === prHead) return { ...base, fresh: true, stale: false, via: "head" };
  // Only a review made on the working tree can have become the next commit.
  // A branch review covers a commit range, so a newer head means new commits.
  if (!state || state.mode !== "uncommitted") return { ...base, fresh: false, stale: true, via: null };

  const parent = gitOutput(["rev-parse", `${prHead}^`], cwd);
  if (parent && parent === reviewed) return { ...base, parent, fresh: true, stale: false, via: "commit" };
  return { ...base, parent: parent || null, fresh: false, stale: true, via: null };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = resolve(process.cwd());
  const gd = gitDir(cwd);
  if (!gd) out({ error: "not a git repository", cwd }, 1);

  const resultPath = args.result || join(gd, "code-review", "last-result.json");
  const result = readJson(resultPath, null);
  if (!result) out({ error: `no review result at ${resultPath}; run /code-review first` }, 1);

  const reportPath = resolve(cwd, args.report || result.reportPath || "");
  if (!reportPath || !existsSync(reportPath)) out({ error: `report not found: ${reportPath || "(none)"}` }, 1);

  const report = redact(readFileSync(reportPath, "utf8")).trim();
  if (!report) out({ error: `report is empty: ${reportPath}` }, 1);

  const detail = (error) =>
    String(error && error.stderr ? error.stderr : error && error.message ? error.message : error)
      .trim()
      .slice(0, 800);

  let repo;
  try {
    repo = gh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"], cwd);
  } catch (error) {
    const message = detail(error);
    // A repository with no GitHub remote has no PR to sync to; that is a
    // normal skip. An unusable gh (missing, logged out, network) is not.
    if (/no git remotes|not a git repository|none of the git remotes|could not determine/i.test(message)) {
      out({ posted: false, reason: "no-pr", detail: message });
    }
    out({ error: "gh repo view failed", detail: message }, 1);
  }

  let pr;
  try {
    const prArgs = ["pr", "view", "--json", "number,url,headRefOid,state"];
    if (args.pr) prArgs.push(args.pr);
    pr = JSON.parse(gh(prArgs, cwd));
  } catch (error) {
    const message = detail(error);
    if (!/no pull requests found/i.test(message)) {
      out({ error: "gh pr view failed", detail: message }, 1);
    }
    if (args.requirePr) out({ error: "no pull request for this branch", detail: message }, 3);
    out({ posted: false, reason: "no-pr", detail: message });
  }

  const head = String(result.head || "");
  const prHead = String(pr.headRefOid || "");
  const freshness = reviewFreshness(result, prHead, cwd);
  const stale = freshness.stale;

  const note = stale
    ? [
        "> [!NOTE]",
        `> This review covers commit \`${head.slice(0, 8)}\`; the pull request head is now \`${prHead.slice(0, 8)}\`.`,
        "> Re-run `/code-review` and sync again to refresh it.",
        "",
      ].join("\n")
    : freshness.via === "commit"
      ? [
          "> [!NOTE]",
          `> This review was run before the change was committed: it covers \`${freshness.reviewed.slice(0, 8)}\`, the parent of the pull request head \`${freshness.prHead.slice(0, 8)}\`, so the pull request adds nothing unreviewed.`,
          "",
        ].join("\n")
      : "";

  const footer = [
    "",
    "---",
    `<sub>Local review on \`${result.reviewer}\` · author model \`${result.author}\` · level ${result.level} · verdict ${result.verdict} · head \`${head.slice(0, 8)}\` · this comment updates in place</sub>`,
  ].join("\n");

  // An incomplete review is not an approval, whatever the verdict field says.
  // The gate blocks on `complete`, and the comment has to say so too.
  const incomplete =
    result.complete === false
      ? [
          "> [!WARNING]",
          "> This review is **incomplete**: not every reviewer reported, or the plan had more chunks than the agent budget. The gate blocks the pull request on this. Re-run `/code-review` and sync again.",
          "",
        ].join("\n")
      : "";

  let body = [MARKER, `<!-- reviewed-head:${head} -->`, note, incomplete, report, footer]
    .filter(Boolean)
    .join("\n\n");
  let truncated = false;
  if (body.length > MAX_BODY) {
    body = body.slice(0, MAX_BODY - 1200) + `\n\n> Report truncated at ${MAX_BODY} characters. Full report: ${result.reportRelative}\n`;
    truncated = true;
  }

  let existingIds = "";
  try {
    existingIds = gh(
      ["api", "--paginate", `repos/${repo}/issues/${pr.number}/comments`, "--jq", `.[] | select(.body | contains("${MARKER}")) | .id`],
      cwd,
    );
  } catch {
    existingIds = "";
  }
  const existingId = existingIds.split("\n").map((s) => s.trim()).filter(Boolean).pop();

  const payload = {
    posted: false,
    repo,
    pr: pr.number,
    url: pr.url,
    existingCommentId: existingId || null,
    action: existingId ? "update" : "create",
    stale,
    freshness: { via: freshness.via, reviewedHead: freshness.reviewed, prHead: freshness.prHead },
    truncated,
    bodyLength: body.length,
  };

  if (!args.apply) {
    out({ ...payload, dryRun: true, body });
  }

  const dir = mkdtempSync(join(tmpdir(), "opencode-code-review-post-"));
  const payloadFile = join(dir, "payload.json");
  writeFileSync(payloadFile, JSON.stringify({ body }));

  try {
    if (existingId) {
      gh(["api", "-X", "PATCH", `repos/${repo}/issues/comments/${existingId}`, "--input", payloadFile], cwd);
    } else {
      gh(["api", "-X", "POST", `repos/${repo}/issues/${pr.number}/comments`, "--input", payloadFile], cwd);
    }
  } catch (error) {
    const detail = String(error && error.stderr ? error.stderr : error && error.message ? error.message : error);
    out({ ...payload, error: "gh api failed", detail: detail.trim().slice(0, 1500) }, 1);
  }

  out({ ...payload, posted: true, dryRun: false });
}

// Run as a CLI, stay importable as a module: the freshness predicate is
// exported so a test can exercise it without a pull request.
function invokedDirectly() {
  try {
    return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return true;
  }
}

if (invokedDirectly()) {
  try {
    main();
  } catch (error) {
    console.error(JSON.stringify({ error: String(error && error.message ? error.message : error) }, null, 2));
    process.exit(1);
  }
}
