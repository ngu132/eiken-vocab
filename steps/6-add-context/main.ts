// vocablist に訳や品詞や例文を追加する

import { streamText } from 'ai'
import dedent from 'ts-dedent'
import { rakutenAI } from '@evex/rakutenai'
import { tqdm, TqdmProgress } from 'node-console-progress-bar-tqdm'
import { TextLineStream } from '@std/streams'
import {
  VocabEntrySchema,
  VocabEntryLLMOutputSchema,
  type VocabEntry,
  type VocabEntryLLMOutput,
} from './schema'
import { source } from './load'
import { toJsonSchema } from '@valibot/to-json-schema'
import * as v from 'valibot'
import pLimit from 'p-limit'
import * as fs from 'node:fs/promises'
import { appendFile, existsSync } from 'node:fs'

const PROMPT = dedent`
  英語学習のため、以下の単語をもとに、各単語すべてについてそれぞれ以下の形式のJSONLに変換しなさい。Output only the JSONL without any extra text.
  <format>
    ${JSON.stringify(toJsonSchema(VocabEntrySchema))}
  </format>
  例:
  \`\`\`jsonl
  {"word":"run","meanings":[...]}]}
  \`\`\`
`

const finishedWords = new Set<string>()

const outputPath = './steps/6-add-context/vocablist-with-context.jsonl'
if (existsSync(outputPath)) {
  const data = await Bun.file(outputPath).text()
  const lines = data.split('\n').filter((line) => line.trim().length > 0)
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line)
      finishedWords.add(parsed.word)
    } catch {
      console.error('Failed to parse line in existing output file:', line)
    }
  }
}
const sourcesHaveToProcess = source.filter((v) => !finishedWords.has(v.vocab))
if (sourcesHaveToProcess.length === 0) {
  console.log('All words have been processed.')
  process.exit(0)
}

// 一番最初に書き込むときに上書きするために一旦閉じる

const pb = new TqdmProgress({
  total: sourcesHaveToProcess.length,
  progressColor: '#f1d3c4',
})
pb.render()

const appendLimit = pLimit(1)

async function processEntries(entries: typeof source) {
  const prompt = dedent`
    ${PROMPT}
    target words:
    ${entries.map((e) => `- ${e.vocab}`).join('\n')}
  `
  const stream = streamText({
    model: rakutenAI('normal'),
    prompt: prompt,
  }).textStream.pipeThrough(new TextLineStream())

  for await (const chunk of stream) {
    let parsed: VocabEntryLLMOutput
    try {
      parsed = v.parse(VocabEntryLLMOutputSchema, JSON.parse(chunk))
    } catch {
      console.log('Failed to parse chunk:', chunk)
      continue
    }
    const original = entries.find((e) => e.vocab === parsed.word)
    if (!original) {
      console.warn('Original entry not found for word:', parsed.word)
      continue
    }

    await appendLimit(() =>
      fs.appendFile(
        outputPath,
        `${JSON.stringify({
          word: parsed.word,
          isPhrase: original.type === 'phrase',
          meanings: parsed.meanings,
          score: {
            '1': original.score_1 as number,
            pre1: original.score_pre1 as number,
            pre2: original.score_pre2 as number,
            '2': original.score_2 as number,
            '3': original.score_3 as number,
            '4': original.score_4 as number,
            '5': original.score_5 as number,
          },
          count: {
            '1': original.count_1 as number,
            pre1: original.count_pre1 as number,
            pre2: original.count_pre2 as number,
            '2': original.count_2 as number,
            '3': original.count_3 as number,
            '4': original.count_4 as number,
            '5': original.count_5 as number,
          },
          rank: {
            '1': original.rank_1 as number,
            pre1: original.rank_pre1 as number,
            pre2: original.rank_pre2 as number,
            '2': original.rank_2 as number,
            '3': original.rank_3 as number,
            '4': original.rank_4 as number,
            '5': original.rank_5 as number,
          },
        })}\n`,
      ),
    )
    finishedWords.add(parsed.word)
    pb.update(1)
  }
}

const promises: Promise<void>[] = []

const limit = pLimit(100)

const BATCH_SIZE = 10
for (let i = 0; i < sourcesHaveToProcess.length; i += BATCH_SIZE) {
  const batch = sourcesHaveToProcess.slice(i, i + BATCH_SIZE)
  promises.push(limit(() => processEntries(batch)))
}

await Promise.all(promises)

// 未処理の単語を表示
const unfinished = sourcesHaveToProcess.filter(
  (e) => !finishedWords.has(e.vocab),
)
if (unfinished.length > 0) {
  console.log(
    'Unprocessed words:',
    `(${unfinished.length})`,
    unfinished.map((e) => e.vocab),
  )
}
