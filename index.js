const express = require('express')
const cors = require('cors')
require('dotenv').config()

const app = express()
const port = process.env.PORT || 5000

app.get('/', (req, res) => {
  res.send('hello from the other side')
})

app.listen(port, () => console.log('listening to port', port))

const { MongoClient, ServerApiVersion } = require('mongodb')
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.bmzoc.mongodb.net/?retryWrites=true&w=majority`
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
})

async function run() {
  try {
    await client.connect()
    console.log('db connected')
    const partsCollection = client.db('tsushimaCorporation').collection('parts')

    app.get('/parts', async (req, res) => {
      const query = req.query
      const result = await partsCollection.find(query).toArray()
      res.send(result)
    })
  } finally {
  }
}

run().catch(console.dir)
