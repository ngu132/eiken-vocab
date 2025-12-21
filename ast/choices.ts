import type { Text } from './text'

export interface EnglishPhraseChoice {
  type: 'EnglishPhraseChoice'
  choice: Text
}
export interface MultipleNumberChoice {
  type: 'MultipleNumberChoice'
  choices: number[]
}

export type Choice = EnglishPhraseChoice | MultipleNumberChoice
