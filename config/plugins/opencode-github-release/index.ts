import { define } from "@opencode-ai/plugin/v2/promise";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";

const run = promisify(execFile);

function bumpVersion(current: string, bump: "patch" | "minor" | "major"): string {
  const prefix = current.startsWith("v") ? "v" : "";
  const cleaned = current.replace(/^v/, "");
  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) throw new Error(`Cannot parse semver from "${current}"`);
  let major = parseInt(match[1]!, 10);
  let minor = parseInt(match[2]!, 10);
  let patch = parseInt(match[3]!, 10);
  if (bump === "major") {
    major++;
    minor = 0;
    patch = 0;
  }
  if (bump === "minor") {
    minor++;
    patch = 0;
  }
  if (bump === "patch") {
    patch++;
  }
  return `${prefix}${major}.${minor}.${patch}`;
}

function classifyCommit(subject: string): { type: "feat" | "fix" | "other"; breaking: boolean } {
  const breaking = /^BREAKING CHANGE:/im.test(subject) || /^\w+(\([^)]*\))?!:/m.test(subject);
  const match = subject.match(/^(\w+)(\([^)]*\))?(!)?\s*:/);
  const type = match?.[1]?.toLowerCase();
  if (type === "feat") return { type: "feat", breaking };
  if (type === "fix") return { type: "fix", breaking };
  return { type: "other", breaking };
}

async function sh(cmd: string, args: string[], opts: { cwd: string }): Promise<string> {
  const { stdout } = await run(cmd, args, { cwd: opts.cwd, timeout: 120000 });
  return stdout;
}

async function shQuiet(cmd: string, args: string[], cwd: string): Promise<void> {
  try {
    await run(cmd, args, { cwd, timeout: 120000 });
  } catch {
    // best-effort (mirrors `|| true` in the v1 implementation)
  }
}

async function latestTag(cwd: string): Promise<string> {
  await shQuiet("git", ["fetch", "--tags", "--force"], cwd);
  try {
    return (await sh("git", ["describe", "--tags", "--abbrev=0"], { cwd })).trim();
  } catch {
    return "v0.0.0";
  }
}

async function logSince(tag: string, cwd: string): Promise<string> {
  try {
    return await sh("git", ["log", `${tag}..HEAD`, "--oneline"], { cwd });
  } catch {
    return "";
  }
}

export default define({
  id: "opencode-github-release",
  async setup(ctx) {
    // NOTE (v1 -> v2): v1 used the `$` shell helper from PluginContext; v2
    // carries no `$`, so git/gh invocations go through node:child_process.
    // Tool results return `{ content }` (v2) instead of `{ title, output }`.
    const cwd = process.cwd();

    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: "release",
        description: "Semantic-version GitHub release helpers",
      });

      editor.add({
        name: "suggest_bump",
        description:
          "Analyze git history since the latest tag and suggest a semantic version bump. Call this tool when the user asks to create a release but does NOT specify patch/minor/major or an explicit version string. After receiving the suggestion, present it to the user and ask for confirmation before calling create_release.",
        input: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        async execute(_input: unknown, _opts: unknown) {
          const tag = await latestTag(cwd);
          const logText = (await logSince(tag, cwd)).trim();
          if (!logText) {
            return { content: `No new commits since ${tag}. No release needed.` };
          }
          const lines = logText.split("\n");
          const entries = lines.map((line) => {
            const hash = line.split(/\s+/)[0]!;
            const subject = line.slice(hash.length).trim();
            const { type, breaking } = classifyCommit(subject);
            return { hash, subject, type, breaking };
          });
          let suggestedBump: "patch" | "minor" | "major" = "patch";
          for (const entry of entries) {
            if (entry.breaking) {
              suggestedBump = "major";
              break;
            }
            if (entry.type === "feat") {
              suggestedBump = "minor";
            }
          }
          const output = entries
            .map((e) => {
              const tag2 =
                e.breaking ? "[BREAKING]" : e.type === "feat" ? "[feat]" : e.type === "fix" ? "[fix]" : "     ";
              return `  ${tag2} ${e.hash} ${e.subject}`;
            })
            .join("\n");
          return {
            content: [
              `Latest tag: ${tag}`,
              `Commits: ${entries.length}`,
              "",
              output,
              "",
              `Suggested bump: ${suggestedBump} -> ${bumpVersion(tag, suggestedBump)}`,
            ].join("\n"),
          };
        },
      });

      editor.add({
        name: "create_release",
        description:
          'Create a git tag and publish a GitHub release with semantic versioning. Provide either `bump` to auto-compute the next version from the latest tag, or an explicit `version` string (e.g. "2.0.0" or "v2.0.0"). If the user only asks to "create a release" without specifying a bump or version, call suggest_bump first instead of this tool.',
        input: {
          type: "object",
          properties: {
            bump: { type: "string", enum: ["patch", "minor", "major"] },
            version: { type: "string" },
            notes: { type: "string" },
            force: { type: "boolean" },
          },
          additionalProperties: false,
        },
        async execute(raw: unknown, _opts: unknown) {
          const args = (raw ?? {}) as {
            bump?: "patch" | "minor" | "major";
            version?: string;
            notes?: string;
            force?: boolean;
          };
          const { bump, version, notes, force } = args;
          if (!bump && !version) {
            throw new Error("Provide either `bump` (patch/minor/major) or an explicit `version` string");
          }
          const status = (await sh("git", ["status", "--porcelain"], { cwd })).trim();
          if (status && !force) {
            const count = status.split("\n").length;
            return {
              content: `${count} uncommitted file(s) detected. Call create_release with force: true to proceed anyway, or commit/stash first.`,
            };
          }
          const tag = await latestTag(cwd);
          const repoUsesV = tag.startsWith("v");
          let tagCount = 0;
          try {
            tagCount = parseInt((await sh("git", ["tag", "-l"], { cwd })).trim().split("\n").filter(Boolean).length, 10);
          } catch {
            tagCount = 0;
          }
          const hasExistingTags = tagCount > 0;
          let newTag: string;
          if (version) {
            const versionHasV = version.startsWith("v");
            if (hasExistingTags && versionHasV !== repoUsesV) {
              const suggestion = versionHasV ? version.replace(/^v/, "") : `v${version}`;
              return {
                content: [
                  `Existing releases use ${repoUsesV ? 'the "v" prefix' : 'no "v" prefix'} (e.g. "${tag}"),`,
                  `but you provided "${version}" which ${versionHasV ? "has" : "does not have"} a "v" prefix.`,
                  "",
                  `Would you like to use "${suggestion}" instead?`,
                  "If so, call create_release again with the corrected version.",
                ].join("\n"),
              };
            }
            newTag = version;
          } else {
            newTag = bumpVersion(tag, bump!);
          }
          const branch = (await sh("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd })).trim();
          let unpushedBefore: Array<{ hash: string; subject: string }> = [];
          if (branch !== "HEAD") {
            try {
              const before = (await sh("git", ["log", `origin/${branch}..HEAD`, "--oneline"], { cwd })).trim();
              if (before) {
                unpushedBefore = before.split("\n").map((line) => {
                  const hash = line.split(/\s+/)[0]!;
                  return { hash, subject: line.slice(hash.length).trim() };
                });
              }
            } catch {
              unpushedBefore = [];
            }
          }
          if (existsSync(`${cwd}/package.json`)) {
            const bareVersion = newTag.replace(/^v/, "");
            await shQuiet("npm", ["version", bareVersion, "--no-git-tag-version"], cwd);
            await shQuiet("git", ["add", "package.json", "package-lock.json"], cwd);
            await shQuiet("git", ["commit", "-m", `chore(release): bump version to ${newTag}`], cwd);
          }
          if (branch !== "HEAD") {
            await shQuiet("git", ["push", "origin", branch], cwd);
          }
          const message = notes || `Release ${newTag}`;
          await shQuiet("git", ["tag", "-a", newTag, "-m", message], cwd);
          await shQuiet("git", ["push", "origin", newTag], cwd);
          if (notes) {
            await shQuiet("gh", ["release", "create", newTag, "--title", newTag, "--notes", notes], cwd);
          } else {
            await shQuiet("gh", ["release", "create", newTag, "--title", newTag, "--generate-notes"], cwd);
          }
          let result = `Created and published ${newTag} (bumped from ${tag})`;
          if (branch !== "HEAD" && unpushedBefore.length > 0) {
            let remainingCount = 0;
            try {
              const remaining = (
                await sh("git", ["log", `origin/${branch}..HEAD`, "--oneline"], { cwd })
              ).trim();
              remainingCount = remaining ? remaining.split("\n").length : 0;
            } catch {
              remainingCount = 0;
            }
            const pushedCount = unpushedBefore.length - remainingCount;
            if (pushedCount > 0) {
              const plural = pushedCount === 1 ? "" : "s";
              result += `\nPushed ${pushedCount} commit${plural} to ${branch}:`;
              for (let i = 0; i < pushedCount; i++) {
                result += `\n  ${unpushedBefore[i]!.hash} ${unpushedBefore[i]!.subject}`;
              }
            }
            if (remainingCount > 0) {
              const plural = remainingCount === 1 ? "" : "s";
              const verb = remainingCount === 1 ? "is" : "are";
              result += `\nNote: ${remainingCount} commit${plural} in this release ${verb} not yet pushed to origin/${branch}.`;
            }
          }
          return { content: result };
        },
      });
    });
  },
});
