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

// middleware
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

// rest api
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
    const userCollection = client.db('tsushimaCorporation').collection('users')
    const userProfileCollection = client
      .db('tsushimaCorporation')
      .collection('userProfiles')
    const reviewCollection = client
      .db('tsushimaCorporation')
      .collection('review')
    const premiumCollection = client
      .db('tsushimaCorporation')
      .collection('premiumMember')

    //verify admin
    async function verifyAdmin(req, res, next) {
      const userEmail = req.decoded.email
      const userInfo = await userCollection.findOne({ email: userEmail })
      if (userInfo.admin) next()
      else res.status(403).send({ message: 'forbidden access' })
    }

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

    // admin shipped order
    app.patch('/order/ship', verifyJWT, verifyAdmin, async (req, res) => {
      const transaction = req.query
      const updateDoc = {
        $set: {
          shipped: true,
        },
      }
      const result = await orderCollection.updateOne(transaction, updateDoc)
      res.send(result)
    })

    // generate jwt and add user to db after user logged in
    app.post('/account/:email', async (req, res) => {
      const email = req.params.email
      const name = req.body.name

      const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN, {
        expiresIn: '1h',
      })
      const userInfo = { email: email, name: name, admin: false }

      const user = await userCollection.findOne({ email: email })
      if (!user) {
        await userCollection.insertOne(userInfo) // add user to collection while firsttime login or sign in
        await userProfileCollection.insertOne({ email: email, name: name }) // create user profile while first time login or sign in
      }

      res.send({ token })
    })

    //all the parts public api
    app.get('/parts', async (req, res) => {
      const amount = Number(req.query.amount)

      const cursor = partsCollection.find({})
      let result
      if (amount) {
        result = await cursor.sort({ _id: -1 }).limit(amount).toArray()
      } else {
        result = await cursor.sort({ _id: -1 }).toArray()
      }

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

    // upload image after the product added to server
    app.put('/part', verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.query
      const filter = { _id: ObjectId(id) }
      const image = req.body
      const options = { upsert: true }
      const updateDoc = {
        $set: image,
      }
      const result = await partsCollection.updateOne(filter, updateDoc, options)
      res.send(result)
    })

    // remove product from the stock
    app.delete('/part', verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.query
      console.log(id)
      const filter = { _id: ObjectId(id) }
      const result = await partsCollection.deleteOne(filter)
      res.send(result)
    })

    // add parts to parts collection
    app.post('/part', verifyJWT, verifyAdmin, async (req, res) => {
      const product = req.body
      const result = await partsCollection.insertOne(product)
      res.send(result)
    })

    // my orders...all the order from a particular user
    app.get('/order', verifyJWT, async (req, res) => {
      const email = req.query.email
      const query = { userEmail: email }
      const result = await orderCollection.find(query).toArray()
      res.send(result)
    })

    app.get('/order/all', verifyJWT, verifyAdmin, async (req, res) => {
      const result = await orderCollection.find({}).toArray()
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

    // get all logged in users from the data base
    app.get('/user', verifyJWT, async (req, res) => {
      const result = await userCollection.find({}).toArray()
      res.send(result)
    })

    // handle admin
    app.patch('/user', verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.query
      const updateDoc = {
        $set: { admin: true },
      }
      const result = await userCollection.updateOne(email, updateDoc)
      res.send(result)
    })

    // check if the user is admin
    app.get('/admin', verifyJWT, async (req, res) => {
      const email = req.query
      //! console.log(email)
      const user = await userCollection.findOne(email)
      res.send({ admin: user?.admin })
    })

    // update one user profile...client: my profile
    app.put('/userProfile', async (req, res) => {
      const email = req.query
      const userInfo = req.body
      console.log(email)
      console.log(userInfo)
      const options = { upsert: true }
      const updateDoc = {
        $set: userInfo,
      }
      const result = await userProfileCollection.updateOne(
        email,
        updateDoc,
        options
      )
      res.send(result)
    })

    // find one user profile by email..client: my profile
    app.get('/userProfile/:email', async (req, res) => {
      const email = req.params.email
      //! console.log(email)
      const result = await userProfileCollection.findOne({ email: email })
      res.send(result)
    })

    // review section
    app.post('/review', async (req, res) => {
      const review = req.body
      console.log(review)
      const result = await reviewCollection.insertOne(review)
      res.send(result)
    })

    //get review
    app.get('/review', async (req, res) => {
      const cursor = reviewCollection.find({})
      const result = await cursor.sort({ _id: -1 }).toArray()
      res.send(result)
    })

    //premium members
    app.post('/premium/:email', verifyJWT, async (req, res) => {
      const email = req.params
      const existUser = await userCollection.findOne(email)
      if (!existUser) return res.status(401).send({ message: 'unauthorized' })
      const alreadyMemeber = await premiumCollection.findOne(email)
      if (alreadyMemeber) return res.send({ message: 'exist' })
      const result = await premiumCollection.insertOne(email)
      res.send(result)
    })
  } finally {
  }
}

run().catch(console.dir)
