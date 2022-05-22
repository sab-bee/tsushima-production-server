const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')
require('dotenv').config()

const app = express()
const port = process.env.PORT || 5000

app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
  res.send('hello from the other side')
})

app.listen(port, () => console.log('listening to port', port))

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.bmzoc.mongodb.net/?retryWrites=true&w=majority`
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
})

function verifyJWT(req, res, next) {
  const auth = req.headers.authorization
  if (!auth) return res.status(401).send({ message: 'unauthorized access' })
  const token = auth.split(' ')[1]
  jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: 'forbidden access' })
    }
    req.decoded = decoded
    next()
  })
}

async function run() {
  try {
    await client.connect()
    console.log('db connected')
    const partsCollection = client.db('tsushimaCorporation').collection('parts')
    const orderCollection = client
      .db('tsushimaCorporation')
      .collection('orders')

    // generate jwt after user logged in
    app.get('/account/:email', async (req, res) => {
      const email = req.params
      const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN, {
        expiresIn: '1h',
      })
      res.send({ token })
    })

    //all the parts public api
    app.get('/parts', async (req, res) => {
      const query = req.query
      const result = await partsCollection.find(query).toArray()
      res.send(result)
    })

    // get individual product
    app.get('/part/:id', verifyJWT, async (req, res) => {
      const id = req.params.id
      const query = { _id: ObjectId(id) }
      const result = await partsCollection.findOne(query)
      res.send(result)
    })

    // post order
    app.post('/item', verifyJWT, async (req, res) => {
      const item = req.body
      console.log(item)
      const result = await orderCollection.insertOne(item)
      res.send(result)
    })
  } finally {
  }
}

run().catch(console.dir)
