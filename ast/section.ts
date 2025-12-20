import type { Content } from './content'
import type {
  ContentUnderstanding,
  InterviewSet,
  JapaneseTranslateWordOrderCombination,
  PassageSet,
  Reallife,
  SelectResponseByConversation,
  SelectResponseByIllustration,
  SelectSentenceByEnglishSentence,
  SelectSentenceReadByIllustration,
  SelectSentencesByConversation,
  ShortSentenceCloze,
} from './question'

export interface ShortSentenceClozeSection {
  type: 'ShortSentenceClozeSection'
  questions: ShortSentenceCloze[]
}
export interface JapaneseTranslateWordOrderCombinationSection {
  type: 'JapaneseTranslateWordOrderCombinationSection'
  blankIndices: number[]
  questions: JapaneseTranslateWordOrderCombination[]
}
export interface ReadContentAndAnswerSection {
  type: 'ReadContentAndAnswerSection'
  contents: Content[]
  questions: ContentUnderstanding[]
}
export interface MultipleReadContentAndAnswerSectionPart {
  type: 'MultipleReadContentAndAnswerSectionPart'
  content: Content
  questions: ContentUnderstanding[]
}
export interface MultipleReadContentAndAnswerSection {
  type: 'MultipleReadContentAndAnswerSection'
  parts: MultipleReadContentAndAnswerSectionPart[]
}

export interface EmailWritingSection {
  type: 'EmailWritingSection'
  context: string[]
  contents: Content[]
  template: Content
}
export interface CompositionWritingSection {
  type: 'CompositionWritingSection'
  context: string[]
  question: string
}
export interface SummaryWritingSection {
  type: 'SummaryWritingSection'
  context: string[]
  content: Content
}

export type ReadingSection =
  | ShortSentenceClozeSection
  | JapaneseTranslateWordOrderCombinationSection
  | ReadContentAndAnswerSection
  | EmailWritingSection

/** イラスト参考で英文と応答を聞きもっとも適切な応答 */
export interface SelectResponseByIllustrationSection {
  type: 'SelectResponseByIllustrationSection'
  question: string
  choices: SelectResponseByIllustration[]
}

/** 対話と質問を聞きその答えとして最も適切なもの */
export interface SelectResponseByConversationSection {
  type: 'SelectResponseByConversationSection'
  questions: SelectResponseByConversation[]
}

/** 3つの英文を聞き絵の内容を最もよく表しているもの */
export interface SelectSentenceReadByIllustrationSection {
  type: 'SelectSentenceReadByIllustrationSection'
  questions: SelectSentenceReadByIllustration[]
}

/** 英文を聞きその内容に合うものを選ぶ */
export interface SelectSentenceByEnglishSentenceSection {
  type: 'SelectSentenceByEnglishSentence'
  questions: SelectSentenceByEnglishSentence[]
}

export interface DialoguesSection {
  type: 'DialoguesSection'
  questions: SelectSentencesByConversation[]
}
export interface PassagesSection {
  type: 'PassagesSection'
  sets: PassageSet[]
}
export interface ReallifeSection {
  type: 'ReallifeSection'
  questions: Reallife[]
}
export interface InterviewSection {
  type: 'InterviewSection'
  sets: InterviewSet[]
}

export type ListeningSection =
  | SelectResponseByIllustrationSection
  | SelectResponseByConversationSection
  | SelectSentenceReadByIllustrationSection
  | SelectSentenceByEnglishSentenceSection
  | ReadContentAndAnswerSection
  | MultipleReadContentAndAnswerSection
  | DialoguesSection
  | PassagesSection
  | ReallifeSection
  | InterviewSection

export type Section = ReadingSection | ListeningSection
