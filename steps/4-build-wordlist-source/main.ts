import { Glob } from 'bun'
import type { Test } from '../../ast'
import type { Section } from '../../ast/section'
import type { Text } from '../../ast/text'
import * as path from 'node:path'
import { mkdir } from 'node:fs/promises'

const stringifyText = (text: Text): string => {
  return text.chunks
    .map((chunk) => {
      if (chunk.type === 'BlankChunk') {
        throw new Error('Unexpected BlankChunk')
      }
      return chunk.text
    })
    .join('')
}
const processSection = (data: Section) => {
  switch (data.type) {
    case 'SelectSentenceByEnglishSentence': {
      let sources: string[] = []
      for (const q of data.questions) {
        sources = [
          ...sources,
          q.question,
          ...q.choices.map((c) => stringifyText(c.choice)),
        ]
      }
      return sources
    }
    case 'ReallifeSection': {
      const sources: string[] = []
      for (const question of data.questions) {
        sources.push(stringifyText(question.script))
        sources.push(question.situation)
        for (const part of question.parts) {
          sources.push(part.question)
          for (const choice of part.choices) {
            sources.push(stringifyText(choice.choice))
          }
        }
      }
      break
    }
    case 'ShortSentenceClozeSection': {
      const sources: string[] = []
      for (const question of data.questions) {
        const answerText = question.choices[question.answerIndex] ?? null
        if (question.sentence.type === 'Conversation') {
          for (const line of question.sentence.lines) {
            sources.push(
              line.text
                .map((chunk) => {
                  if (chunk.type === 'BlankChunk') {
                    return answerText ? stringifyText(answerText.choice) : '__'
                  }
                  return chunk.text
                })
                .join(''),
            )
          }
        } else {
          sources.push(
            question.sentence.chunks
              .map((chunk) => {
                if (chunk.type === 'BlankChunk') {
                  return answerText ? stringifyText(answerText.choice) : '__'
                }
                return chunk.text
              })
              .join(''),
          )
        }
        for (const [i, choice] of question.choices.entries()) {
          if (i === question.answerIndex) {
            continue
          }
          sources.push(stringifyText(choice.choice))
        }
      }
      break
    }
    case 'MultipleReadContentAndAnswerSection': {
      const sources: string[] = []
      const answerMap: Record<string, string> = {}
      for (const part of data.parts) {
        for (const question of part.questions) {
          for (const [i, choice] of question.choices.entries()) {
            if (i === question.answerIndex) {
              answerMap[question.index ?? ''] = stringifyText(choice.choice)
            } else {
              sources.push(stringifyText(choice.choice))
            }
          }
        }
      }
      for (const part of data.parts) {
        const t = part.content.content.chunks
          .map((chunk) => {
            if (chunk.type === 'BlankChunk') {
              return answerMap[chunk.id ?? ''] ?? '__'
            }
            return chunk.text
          })
          .join('')
        sources.push(t)
      }
      return sources
    }
    case 'SelectResponseByConversationSection': {
      const sources: string[] = []
      for (const question of data.questions) {
        for (const line of question.conversation.lines) {
          sources.push(stringifyText({ type: 'Text', chunks: line.text }))
        }
        for (const [i, choice] of question.choices.entries()) {
          if (i === question.answerIndex) {
            continue
          }
          sources.push(stringifyText(choice.choice))
        }
      }
      return sources
    }
    case 'ReadContentAndAnswerSection': {
      const sources: string[] = []
      const answerMap: Record<string, string> = {}
      for (const question of data.questions) {
        for (const [i, choice] of question.choices.entries()) {
          if (i === question.answerIndex) {
            answerMap[question.index ?? ''] = stringifyText(choice.choice)
          } else {
            sources.push(stringifyText(choice.choice))
          }
        }
      }
      for (const content of data.contents) {
        const t = content.content.chunks
          .map((chunk) => {
            if (chunk.type === 'BlankChunk') {
              return answerMap[chunk.id ?? ''] ?? '__'
            }
            return chunk.text
          })
          .join('')
        sources.push(t)
      }
      return sources
    }
    case 'JapaneseTranslateWordOrderCombinationSection': {
      const sources: string[] = []
      for (const question of data.questions) {
        for (const word of question.words) {
          sources.push(word.text)
        }
      }
      return sources
    }
    default:
      throw new Error(`Unknown section type: ${data.type}`)
  }
  return []
}
const processJSON = (data: Test) => {
  const sections = [...data.listeningSections, ...data.readingSections]
  let sources: string[] = []
  for (const section of sections) {
    sources = sources.concat(processSection(section))
  }
  sources = sources.map(input => {
    let cur = input
    cur = cur.trim()
    cur = cur.replaceAll('’', "'")
      .replaceAll('“', '"')
      .replaceAll('”', '"')
      .replaceAll('―', '-')
      .replaceAll('…', '...')
    return cur
  })
  return sources
}
for await (const jsonPath of new Glob('./data/parsed/*.json').scan()) {
  const data: Test = await Bun.file(jsonPath).json()
  const outputPath = path.join('data/wordlist-sources', `${path.basename(jsonPath)}`)
  await mkdir(path.dirname(outputPath), { recursive: true })
  const output = processJSON(data)
  await Bun.write(outputPath, JSON.stringify(output, null, 2))
}
