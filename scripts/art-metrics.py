#!/usr/bin/env python3
"""Lightweight visual diagnostics for captured 3D game screenshots."""

from __future__ import annotations

import json
import math
import sys
from collections import Counter
from pathlib import Path

from PIL import Image, ImageFilter, ImageStat


def analyze(path: Path) -> dict[str, object]:
    source = Image.open(path).convert("RGB")
    image = source.resize((320, 200), Image.Resampling.LANCZOS)
    pixels = list(image.getdata())
    quantized = Counter((r >> 3, g >> 3, b >> 3) for r, g, b in pixels)
    total = len(pixels)
    entropy = -sum((count / total) * math.log2(count / total) for count in quantized.values())
    luminance = image.convert("L")
    stats = ImageStat.Stat(luminance)
    edges = luminance.filter(ImageFilter.FIND_EDGES)
    edge_density = sum(value >= 18 for value in edges.getdata()) / total
    return {
        "file": path.name,
        "size": list(source.size),
        "colorEntropyBits": round(entropy, 3),
        "dominantColorShare": round(max(quantized.values()) / total, 3),
        "edgeDensity": round(edge_density, 4),
        "luminanceMean": round(stats.mean[0], 2),
        "luminanceStdDev": round(stats.stddev[0], 2),
    }


def main() -> int:
    paths = [Path(arg) for arg in sys.argv[1:]]
    if not paths:
        print("usage: python scripts/art-metrics.py IMAGE...", file=sys.stderr)
        return 2
    results = []
    for path in paths:
        if not path.is_file():
            print(f"missing image: {path}", file=sys.stderr)
            return 1
        results.append(analyze(path))
    print(json.dumps(results, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
