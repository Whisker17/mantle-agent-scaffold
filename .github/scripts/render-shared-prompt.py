#!/usr/bin/env python3
"""Render a shared Mantle prompt template with runtime and profile variables."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


PLACEHOLDER_RE = re.compile(r"\{\{[A-Z_]+\}\}")


def render_markdown_value(value: Any, name: str) -> str:
    if isinstance(value, list):
        return "\n".join(f"- {item}" for item in value)
    if isinstance(value, str):
        return value
    raise TypeError(f"profile variable {name} must be a string or string array")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prompts-dir", required=True, help="Checkout directory for mantle-prompts.")
    parser.add_argument("--prompt-path", required=True, help="Prompt template path inside --prompts-dir.")
    parser.add_argument("--profile-path", required=True, help="Repository profile path inside --prompts-dir.")
    parser.add_argument("--repo", required=True, help="Expected GitHub repository in owner/name form.")
    parser.add_argument("--pr-number", required=True, help="GitHub pull request number.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    prompts_dir = Path(args.prompts_dir)
    template_path = prompts_dir / args.prompt_path
    profile_path = prompts_dir / args.profile_path

    template = template_path.read_text(encoding="utf-8")
    profile = json.loads(profile_path.read_text(encoding="utf-8"))
    profile_repo = profile.get("repository")
    if not isinstance(profile_repo, str):
        raise TypeError("profile repository must be a string")
    if profile_repo.lower() != args.repo.lower():
        raise ValueError(f"profile repository {profile_repo!r} does not match expected repo {args.repo!r}")

    variables = profile.get("variables", {})

    replacements = {
        "{{PR_NUMBER}}": args.pr_number,
        "{{REPO}}": profile_repo,
        "{{TARGET_LABEL}}": f"PR #{args.pr_number} in {profile_repo}",
        "{{USER_FOCUS}}": render_markdown_value(variables.get("USER_FOCUS"), "USER_FOCUS"),
        "{{REPOSITORY_PROFILE}}": render_markdown_value(
            variables.get("REPOSITORY_PROFILE"),
            "REPOSITORY_PROFILE",
        ),
    }

    rendered = template
    for placeholder, value in replacements.items():
        rendered = rendered.replace(placeholder, value)

    unresolved = sorted(set(PLACEHOLDER_RE.findall(rendered)))
    if unresolved:
        print(
            f"Unresolved prompt placeholders in {template_path}: {', '.join(unresolved)}",
            file=sys.stderr,
        )
        return 1

    print(rendered, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
