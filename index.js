const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')
require('dotenv').config()
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

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
    const paymentCollection = client
      .db('tsushimaCorporation')
      .collection('payments')

    //stripe payment get payment secret
    app.post('/create-payment-intent', verifyJWT, async (req, res) => {
      const totalPrice = req.body.totalPrice
      const amount = totalPrice * 100
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card'],
      })
      res.send({ clientSecret: paymentIntent.client_secret })
    })

    // update paid status after payment
    app.patch('/order', verifyJWT, async (req, res) => {
      const id = req.query.id
      const query = { _id: ObjectId(id) }
      const paymentInfo = req.body
      console.log(query)
      console.log('paymentInfo :>> ', paymentInfo)
      const updateDoc = {
        $set: {
          paid: true,
          transactionId: paymentInfo.transactionId,
        },
      }
      const patchResult = await orderCollection.updateOne(query, updateDoc)
      const result = await paymentCollection.insertOne(paymentInfo)

      res.send(updateDoc)
    })

    // get payment detail after payment is done
    app.get('/payment/:id', verifyJWT, async (req, res) => {
      const id = req.params.id
      const query = { _id: ObjectId(id) }
      const result = await paymentCollection.findOne(query)
      res.send(result)
    })

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
    app.post('/order', verifyJWT, async (req, res) => {
      const item = req.body
      const result = await orderCollection.insertOne(item)
      res.send(result)
      // res.send({ success: true })
    })

    // modify parts quntity
    app.patch('/part', verifyJWT, async (req, res) => {
      const id = req.query.id
      const filter = { _id: ObjectId(id) }
      const updateQuantity = req.body
      const updateDoc = {
        $set: updateQuantity,
      }
      const result = await partsCollection.updateOne(filter, updateDoc)
      res.send(result)
    })

    // my orders...all the order from a particular user
    app.get('/order', verifyJWT, async (req, res) => {
      const email = req.query.email
      const query = { userEmail: email }
      const result = await orderCollection.find(query).toArray()
      res.send(result)
    })

    // cancel order if unpaid
    app.delete('/order', verifyJWT, async (req, res) => {
      const id = req.query.id
      //! console.log(id)
      const query = { _id: ObjectId(id) }

      const result = await orderCollection.deleteOne(query)
      res.send(result)
    })

    // get specific order from a particular user
    app.get('/order/:id', verifyJWT, async (req, res) => {
      const id = req.params.id
      const query = { _id: ObjectId(id) }
      const order = await orderCollection.findOne(query)
      res.send(order)
    })
  } finally {
  }
}

run().catch(console.dir)
