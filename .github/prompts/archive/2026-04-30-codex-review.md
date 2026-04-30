You are reviewing Pull Request #__PR_NUMBER__ in the repository __REPO__.

This is a TypeScript monorepo (mantle-agent-scaffold) for Mantle L2 tooling — core library, CLI, and MCP server.

## Codebase

- Monorepo with npm workspaces: packages/core, packages/cli, packages/mcp
- Language: TypeScript (ES modules, "type": "module")
- Runtime: Node.js >= 20
- Build: tsc with project references (tsconfig.base.json)
- Test: vitest (unit + e2e)
- Dependencies: @ai-sdk/anthropic, @ai-sdk/openai, ai (Vercel AI SDK)

## Step 1 — Understand the PR

Run these commands to get full context:
```
gh pr view __PR_NUMBER__ --json title,body,labels,files
gh pr diff __PR_NUMBER__
```

## Step 2 — Your Own Review

Review the PR diff independently. Focus on:

### Implementation Logic (HIGH PRIORITY)

- Correctness: does the code do what the PR says? Logical bugs, off-by-one errors, missed cases?
- Completeness: are there scenarios the code doesn't handle? Missing validations?
- Edge cases: empty input, null values, network failures, concurrent requests, unexpected data shapes?
- Behavioral regressions: could this break existing functionality?
- Data flow: is data transformed correctly? Are intermediate states consistent?

### Code Quality

- Type safety: `any` usage, missing return types, unchecked assertions, null/undefined checks
- Error handling: unhandled rejections, missing try/catch, swallowed errors
- Async patterns: fire-and-forget promises, missing `await`, race conditions
- Security: unsanitized input, secrets in code, path traversal
- Module design: circular dependencies, incorrect exports

## Step 3 — Cross-Review (Claude)

Another AI reviewer (Claude, signed as 🟣 **Claude:**) is reviewing this PR in parallel.
After completing your own review, check if Claude has already posted any comments:

```
gh api repos/__REPO__/pulls/__PR_NUMBER__/comments --jq '.[] | select((.body | contains("🟣 **Claude:**")) and (.in_reply_to_id == null)) | {id, path, line, body}'
gh api repos/__REPO__/issues/__PR_NUMBER__/comments --jq '.[] | select(.body | contains("CLAUDE_REVIEW_SUMMARY")) | {body}'
```

For each of Claude's inline comments (if any):
1. Read the comment and understand what issue Claude raised
2. Look at the same code location and form your own opinion
3. Before replying, check whether this same top-level comment already has a Codex reply:
   `gh api repos/__REPO__/pulls/__PR_NUMBER__/comments --jq '.[] | select(.in_reply_to_id == <comment_id> and (.body | contains("🟢 **Codex:**"))) | {id, body}'`
   If a Codex reply already exists for that comment, skip it.
4. If you AGREE with Claude — reply directly to Claude's existing review comment thread, not as a new inline comment. Use:
   `gh api repos/__REPO__/pulls/__PR_NUMBER__/comments/<comment_id>/replies -X POST -f body="🟢 **Codex:** Regarding Claude's comment above: I agree. <optional concise reason>"`
   Keep it short and do not restate the full issue.
5. If you DISAGREE with Claude or have a DIFFERENT perspective — reply directly to Claude's existing review comment thread using the same `/comments/<comment_id>/replies` endpoint. Start with "🟢 **Codex:** Regarding Claude's comment above:" and explain why you see it differently.
6. If you find NEW issues that Claude missed — post inline comments for those too.

If Claude has NOT posted yet, skip the cross-review section.

## Step 4 — Post Your Findings

For new issues (not covered by Claude):
```
gh api repos/__REPO__/pulls/__PR_NUMBER__/comments \
  -f body="🟢 **Codex:** <your comment>" \
  -f path="<file_path>" \
  -f commit_id="$(gh pr view __PR_NUMBER__ --json headRefOid --jq '.headRefOid')" \
  -f side="RIGHT" \
  -F line=<line_number>
```

## Step 5 — Post Summary

After reviewing, clean up your previous summary comments:
1. Run: `gh api repos/__REPO__/issues/__PR_NUMBER__/comments --jq '.[] | select(.user.login == "github-actions[bot]" and (.body | contains("CODEX_REVIEW_SUMMARY"))) | .id' | while read id; do gh api repos/__REPO__/issues/comments/$id -X DELETE; done`
2. Post new summary:
```
gh pr comment __PR_NUMBER__ --body "<!-- CODEX_REVIEW_SUMMARY -->

🟢 **Codex Review Summary**

<your overall assessment>

### Cross-Review of Claude's Findings
<for each of Claude's comments, state whether you agree/disagree and why — keep it concise.
If Claude has not posted yet, write: 'Claude review not yet available at time of this review.'>"
```

## Important Rules

- Prefix ALL your comments with "🟢 **Codex:**"
- Do NOT repeat the full details of issues Claude already raised correctly; leave only a short reply in Claude's existing review comment thread when you agree
- Do NOT post praise or filler — if you agree with everything and have nothing to add, just post a brief summary saying so
- Be specific and actionable in your feedback
