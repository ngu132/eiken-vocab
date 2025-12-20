import * as v from 'valibot'

export const MeaningSchema = v.object({
  class: v.union([
    v.literal('noun'),
    v.literal('pronoun'),
    v.literal('verb'),
    v.literal('adjective'),
    v.literal('adverb'),
    v.literal('preposition'),
    v.literal('conjunction'),
    v.literal('interjection'),
    v.literal('article'),
    v.literal('auxiliary-verb'),
    v.literal('phrase'),
    v.literal('other'),
  ]),
  translation: v.pipe(v.string(), v.description('日本語訳')),
  examplePhrase: v.string(),
  examplePhraseTranslation: v.pipe(v.string(), v.description('日本語訳')),
  exampleSentence: v.string(),
  exampleSentenceTranslation: v.pipe(v.string(), v.description('日本語訳')),
})
export type Meaning = v.InferOutput<typeof MeaningSchema>

export const VocabEntryLLMOutputSchema = v.object({
  word: v.string(),
  meanings: v.array(MeaningSchema),
})
export type VocabEntryLLMOutput = v.InferOutput<typeof VocabEntryLLMOutputSchema>
export const VocabEntrySchema = v.object({
  word: v.string(),
  isPhrase: v.boolean(),
  meanings: v.array(MeaningSchema),
  score: v.object({
    '1': v.number(),
    pre1: v.number(),
    '2': v.number(),
    pre2: v.number(),
    '3': v.number(),
    '4': v.number(),
    '5': v.number(),
  }),
  count: v.object({
    '1': v.number(),
    pre1: v.number(),
    '2': v.number(),
    pre2: v.number(),
    '3': v.number(),
    '4': v.number(),
    '5': v.number(),
  }),
  rank: v.object({
    '1': v.number(),
    pre1: v.number(),
    '2': v.number(),
    pre2: v.number(),
    '3': v.number(),
    '4': v.number(),
    '5': v.number(),
  }),
})
export type VocabEntry = v.InferOutput<typeof VocabEntrySchema>
