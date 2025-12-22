import express from 'express'
import { mockVideoFeed } from './data/yt.xml.mjs'

const app = express()
const PORT = 4100

app.get('/videos.xml', (req, res) => {
  res.set('Content-Type', 'application/xml')
  res.send(mockVideoFeed)
})

app.listen(4100, '0.0.0.0', () => {
  console.log(`Mock API listening on http://0.0.0.0:${PORT}`)
})
