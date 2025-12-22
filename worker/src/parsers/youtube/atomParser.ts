import { XMLParser } from 'fast-xml-parser'
import { XML_PARSER_CONFIG } from '../../env'
import type { AtomFeed } from '../../types/youtube'

export function parseXmlFeed(xml: string): AtomFeed {
  const parser = new XMLParser(XML_PARSER_CONFIG)
  return parser.parse(xml)
}
