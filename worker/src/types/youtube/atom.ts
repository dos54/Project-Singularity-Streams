export interface AtomEntryAuthor {
  name: string
  uri: string
}

export interface AtomEntryLink {
  '@_href': string
}

export interface AtomEntryThumbnail {
  '@_url': string
  '@_width': string
  '@_height': string
}

export interface AtomMediaGroup {
  'media:title'?: string
  'media:content'?: unknown
  'media:thumbnail'?: AtomEntryThumbnail | AtomEntryThumbnail[]
  'media:description': string
  'media:community'?: {
    'media:starRating'?: {
      '@_count': string
      '@_average': string
      '@_min': string
      '@_max': string
    }
    'media:statistics'?: {
      '@_views'?: string
    }
  }
}

export type AtomEntry = {
  id: string
  'yt:videoId': string
  'yt:channelId': string
  title: string
  link: AtomEntryLink
  author: AtomEntryAuthor
  published: string
  updated?: string
  'media:group': AtomMediaGroup
}

export interface AtomFeed {
  feed: {
    entry: AtomEntry[]
  }
}
