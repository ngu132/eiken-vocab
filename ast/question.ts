import type { EnglishPhraseChoice, MultipleNumberChoice } from './choices'
import type { Content } from './content'
import type { Conversation } from './conversation'
import type { EnglishChunk, Text } from './text'

export interface ShortSentenceCloze {
  type: 'ShortSentenceCloze'
  index?: number
  sentence: Text | Conversation
  choices: EnglishPhraseChoice[]
  answerIndex: number
}
export interface JapaneseTranslateWordOrderCombination {
  type: 'JapaneseTranslateWordOrderCombination'
  index?: number
  question: string
  words: EnglishChunk[]
  choices: MultipleNumberChoice[]
  answerIndex: number
}
export interface SelectTrueSentence {
  type: 'SelectTrueSentence'
  index?: number
  question: string
  choices: EnglishPhraseChoice[]
  answerIndex: number
}
export interface SentenceCompletion {
  type: 'SentenceCompletion'
  index?: number
  sentence: Text
  choices: EnglishPhraseChoice[]
  answerIndex: number
}
export interface ContentCloze {
  type: 'ContentCloze'
  index?: number
  content: Text
  choices: EnglishPhraseChoice[]
  answerIndex: number
}

export type ContentUnderstanding =
  | SelectTrueSentence
  | SentenceCompletion
  | ContentCloze

export type ReadingQuestion =
  | ShortSentenceCloze
  | JapaneseTranslateWordOrderCombination
  | ContentUnderstanding

export interface SelectResponseByIllustration {
  type: 'SelectResponseByIllustration'
  index?: number
  question: string
  choices: EnglishPhraseChoice[]
  answerIndex: number
}
export interface SelectResponseByConversation {
  type: 'SelectResponseByConversation'
  index?: number
  conversation: Conversation
  choices: EnglishPhraseChoice[]
  answerIndex: number
}
export interface SelectSentenceReadByIllustration {
  type: 'SelectSentenceReadByIllustration'
  index?: number
  question: string
  choices: EnglishPhraseChoice[]
  answerIndex: number
}
export interface SelectSentenceByEnglishSentence {
  type: 'SelectSentenceByEnglishSentence'
  index?: number
  question: string
  choices: EnglishPhraseChoice[]
  answerIndex: number
}
export interface SelectSentenceByConversation {
  type: 'SelectSentenceByConversation'
  index?: number
  conversation: Conversation
  choices: EnglishPhraseChoice[]
  answerIndex: number
}
export interface SelectSentencesByConversation {
  type: 'SelectSentencesByConversation'
  index?: number
  conversation: Conversation
  choices: EnglishPhraseChoice[]
  answerIndices: number[]
  question?: string
}
export interface PassageSet {
  type: 'PassageSetQuestion'
  index?: number
  passage: Content
  questions: SelectSentencesByConversation[]
}
export interface ReallifePart {
  type: 'ReallifePart'
  index?: number
  question: string
  choices: EnglishPhraseChoice[]
  answerIndices: number[]
}
export interface Reallife {
  type: 'Reallife'
  index?: number
  situation: string
  script: Text
  parts: ReallifePart[]
}
export interface InterviewSetPart {
  type: 'ListeningInterviewSetPart'
  index?: number
  question: string
  choices: EnglishPhraseChoice[]
  answerIndices: number[]
}
export interface InterviewSet {
  type: 'ListeningInterviewSet'
  index?: number
  interview: Conversation
  parts: InterviewSetPart[]
}

export type ListeningQuestion =
  | SelectResponseByIllustration
  | SelectResponseByConversation
  | SelectSentenceReadByIllustration
  | SelectSentenceByEnglishSentence
  | SelectSentenceByConversation
  | SelectSentencesByConversation
  | PassageSet
  | Reallife
  | InterviewSet

export type Question = ReadingQuestion | ListeningQuestion
