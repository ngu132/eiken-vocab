# eiken

This is a working repository to convert EIKEN past exam PDFs into machine-friendly structured data (AST/JSON), and then generate a study-oriented vocabulary dataset (frequency, grade-level scores, translations/examples via LLM). The `viewer/` app lets you quickly browse the generated `metadata.jsonl`.

## Layout

- `ast/`: TypeScript AST definitions
- `steps/`: pipeline steps (Python + TypeScript)
- `data/`: intermediate artifacts and outputs
- `viewer/`: a simple viewer for `data/vocab/metadata.jsonl` (SolidJS + Vite)

## Setup

### Python (PDF preprocessing / counting)

- Python `3.11` (see `.python-version`)
- Use existing venv:
  - `source .venv/bin/activate`
- With `uv` (`uv.lock` exists):
  - `uv sync && source .venv/bin/activate`
- Without `uv` (example):
  - `python -m venv .venv && source .venv/bin/activate`
  - `pip install -e .`

### Bun (LLM formatting / parsing / viewer)

- Root:
  - `bun install`
- Viewer:
  - `cd viewer && bun install`

## Workflow (steps)

All inputs/outputs live under `data/` by default.

### 1) PDF preprocessing (merge/cleanup)

- Goal: merge question/answer/script PDFs into a single, easier-to-process PDF
- Code: `steps/1-preprocess-pdf/*.py` (notebook: `steps/1-preprocess-pdf/main.ipynb`)
- Output (example): `data/eiken_combined/{grade}_{year}_{admin}.pdf`

### 2) Format PDF text via LLM (XML-ish)

- Goal: read PDFs per section and emit minified XML-like text
- Code: `steps/2-format-by-llm/index.ts`
- Input: `data/eiken_combined/*.pdf`
- Output: `data/output/{grade}_{year}_{admin}/reading_*.txt` / `listening_*.txt`
- Run (example): `bun steps/2-format-by-llm/index.ts`
  - Dependency: `@evex/rakutenai` (authentication is configured in your runtime environment)

### 3) Parse LLM output into AST JSON

Converts `data/output/**/*.txt` (HTML/XML-ish) into `data/parsed/*.json` matching `ast/*`.

- Run: `bun run step:3:parse-llm-output`
- Script: `steps/3-parse-llm-output/output_html_to_ast_json.ts`

### 4) Extract source strings for wordlist generation

- Goal: collect strings from parsed JSON as inputs for vocabulary counting
- Code: `steps/4-build-wordlist-source/main.ts`
- Input: `data/parsed/*.json`
- Output: `data/wordlist-sources/*.json`
- Run (example): `bun steps/4-build-wordlist-source/main.ts`

### 5) Vocabulary counting / scoring (mostly notebook-based)

- Goal: count unigrams/phrases and produce per-grade scores as CSV
- Code: `steps/5-build-vocablist/main.ipynb`, `steps/5-build-vocablist/count.py`
- Output (example): `data/wordlist-scores/vocablist_by_grade.csv`

### 6) Add vocabulary metadata (translation, POS, examples)

- Goal: enrich scored vocab items into a learning-friendly JSONL
- Code: `steps/6-add-context/main.ts`
- Input: `data/wordlist-scores/vocablist_by_grade.csv`
- Output: `data/vocab/metadata.jsonl`
- Run (example): `bun steps/6-add-context/main.ts`
  - Dependency: `@evex/rakutenai` (authentication is configured in your runtime environment)

## Viewer

`viewer/` is a small local UI to search/sort `metadata.jsonl` and copy TSV (e.g. for Quizlet).

- Copy `data/vocab/metadata.jsonl` to `viewer/src/assets/metadata.jsonl`
- Start: `cd viewer && bun run dev`
