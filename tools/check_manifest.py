"""Reads gmx-plugin.toml the way the mixer's validator would on the points
that matter here: it parses, names this plugin, and every path it gives is
inside the repository and exists. Python 3.11 or later, no packages."""
import pathlib
import sys
import tomllib

ROOT = pathlib.Path(__file__).resolve().parent.parent
problems = []
manifest = tomllib.loads((ROOT / "gmx-plugin.toml").read_text(encoding="utf-8"))
plugin = manifest.get("plugin", {})
if plugin.get("name") != "hls-player":
    problems.append("plugin.name is not hls-player")
for key in ("version", "api", "description", "license", "platforms", "placements"):
    if not plugin.get(key):
        problems.append(f"plugin.{key} is missing")
for i, provide in enumerate(manifest.get("provides", [])):
    paths = [provide.get("skill")]
    if provide.get("kind") == "panel":
        paths.append(provide.get("panel", {}).get("entry"))
    for path in filter(None, paths):
        if path.startswith("/") or ".." in path or not (ROOT / path).is_file():
            problems.append(f"provides[{i}] names {path}, which is not a file in the repository")
for problem in problems:
    print(problem, file=sys.stderr)
print("gmx-plugin.toml: ok" if not problems else f"gmx-plugin.toml: {len(problems)} problem(s)")
sys.exit(1 if problems else 0)
