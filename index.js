const express = require("express");
const app = express();
const cors = require("cors");
// firebase admin sdk (jwt)
const admin = require("firebase-admin");
require("dotenv").config();
const port = process.env.PORT || 5000;
const { MongoClient } = require("mongodb");
const ObjectId = require("mongodb").ObjectId;
// initialize stripe from .env file
const stripe = require("stripe")(process.env.STRIPE_SECRET);
// file upload
const fileUpload = require("express-fileupload");

// firebase admin sdk (jwt)
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
// const serviceAccount = require("./doctors-portal-229-firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// verifyToken (jwt)
async function verifyToken(req, res, next) {
  if (req.headers?.authorization?.startsWith("Bearer ")) {
    const token = req.headers.authorization.split(" ")[1];

    try {
      const decodedUser = await admin.auth().verifyIdToken(token);
      req.decodedEmail = decodedUser.email;
    } catch {}
  }
  next();
}

//middleware
app.use(cors());
app.use(express.json());
// middleware for file upload
app.use(fileUpload());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.5rymw.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// post a single appointment

// async function
async function run() {
  try {
    await client.connect();
    const database = client.db("doctors_portal");
    const appointmentsCollection = database.collection("appointments");
    // new collection for users
    const usersCollection = database.collection("users");
    // new collection for doctors
    const doctorsCollection = database.collection("doctors");

    // get all appointments from the database
    app.get("/appointments", verifyToken, async (req, res) => {
      const email = req.query.email;
      const date = req.query.date;
      const query = { email: email, date: date };
      const cursor = appointmentsCollection.find(query);
      const appointments = await cursor.toArray();
      res.json(appointments);
    });

    // get single appointment details from appointments collection
    app.get("/appointments/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await appointmentsCollection.findOne(query);
      res.json(result);
    });

    // post a new appointment to appointments collection
    app.post("/appointments", async (req, res) => {
      const appointment = req.body;
      const result = await appointmentsCollection.insertOne(appointment);
      //   console.log(result);
      res.json(result);
    });

    // get all doctors from doctors collection
    app.get("/doctors", async (req, res) => {
      const cursor = await doctorsCollection.find({});
      const doctors = await cursor.toArray();
      res.json(doctors);
    });

    // post a new doctor to doctors collection
    app.post("/doctors", async (req, res) => {
      const name = req.body.name;
      const email = req.body.email;
      const image = req.files.image;
      const imageData = image.data;
      const encodedImage = imageData.toString("base64");
      const imageBuffer = Buffer.from(encodedImage, "base64");
      const doctor = {
        name,
        email,
        image: imageBuffer,
      };
      const result = await doctorsCollection.insertOne(doctor);
      res.json(result);
    });

    // get whether an user is Admin or not
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let isAdmin = false;
      if (user?.role === "admin") {
        isAdmin = true;
      }
      res.json({ admin: isAdmin });
    });

    // post a new user to users collection
    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      console.log(result);
      res.json(result);
    });

    // update a user only if it's not included in the collections
    app.put("/users", async (req, res) => {
      const user = req.body;
      // console.log("put", user);
      // filter here is same as query
      const filter = { email: user.email };
      const options = { upsert: true };
      // updateDoc means what to update
      const updateDoc = { $set: user };
      const result = await usersCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.json(result);
    });

    // update user as admin (jwt)
    app.put("/users/admin", verifyToken, async (req, res) => {
      const user = req.body;
      // update for jwt token
      const requester = req.decodedEmail;
      if (requester) {
        const requesterAccount = await usersCollection.findOne({
          email: requester,
        });
        if (requesterAccount.role === "admin") {
          const filter = { email: user.email };
          const updateDoc = { $set: { role: "admin" } };
          const result = await usersCollection.updateOne(filter, updateDoc);
          res.json(result);
        }
      } else {
        res
          .status(403)
          .json({ message: "You do not have access to make admin" });
      }
    });

    // post strip payment
    app.post("/create-payment-intent", async (req, res) => {
      const paymentInfo = req.body;
      const amount = paymentInfo.price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        currency: "usd",
        amount: amount,
        payment_method_types: ["card"],
      });
      res.json({ clientSecret: paymentIntent.client_secret });
    });

    // put (update) appointments payment
    app.put("/appointments/:id", async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updateDoc = {
        $set: {
          payment: payment,
        },
      };
      const result = await appointmentsCollection.updateOne(filter, updateDoc);
      res.json(result);
    });
  } finally {
    //   await client.close();
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello Doctors Portal!");
});

app.listen(port, () => {
  console.log(`listening at ${port}`);
});
