import type { Text } from './text'

export interface EmailContent {
  type: 'EmailContent'
  content: Text
}
export interface PosterContent {
  type: 'PosterContent'
  content: Text
}
export interface SentenceContent {
  type: 'SentenceContent'
  title?: string
  content: Text
}
export interface PassageContent {
  type: 'PassageContent'
  title?: string
  content: Text
}

export type Content =
  | EmailContent
  | PosterContent
  | SentenceContent
  | PassageContent
