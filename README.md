- `./ast` ... Abstract Syntax Tree (AST) definitions for eiken tests.
- `./steps` ... Steps to create results.
  - `1-preprocess-pdf` ... Preprocess PDF files to pass to LLM.
    - The result will be stored in `data/eiken-combined/{grade}_{year}_{admin}.pdf`.
  - `2-format-by-llm` ... Format pdf content using LLM. Outputs XML-like structure.
    - The result will be stored in `data/eiken-llm-formatted/{grade}_{year}_{admin}/{section}.txt`.
  - `3-parse-llm-output` ... Parse LLM output into AST structure using HTML parser.
    - The result will be stored in `data/eiken-ast/{grade}_{year}_{admin}.json`

## Steps

### 3. Parse LLM output into AST JSON

Converts `output/**/*.txt` (HTML/XML-ish) into `parsed/*.json` matching the `ast/*` TypeScript shapes.

- Run: `bun run step:3:parse-llm-output`
- Script: `steps/3-parse-llm-output/output_html_to_ast_json.ts`
