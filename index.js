const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors');
const jwt = require("jsonwebtoken");
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@practice-mongo.h6y3sbv.mongodb.net/?appName=Practice-mongo`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});


async function run() {
  try {
    await client.connect();
    const db = client.db("LocalChefBazar");
    const mealsCollection = db.collection("meals");
    const reviewsCollection = db.collection('reviews');
    const usersCollection = db.collection("users");
    const requestsCollection = db.collection("requests");




    app.post("/requests", async (req, res) => {
  try {
    const request = req.body; 
    const result = await requestsCollection.insertOne(request);
    res.send({ success: true, result });
  } catch (err) {
    res.status(500).send({ success: false, message: "Failed to create request", error: err });
  }
});


app.get("/meals", async (req, res) => {
  const sort = req.query.sort === "desc" ? -1 : 1;

  const meals = await mealsCollection
    .find()
    .sort({ price: sort })
    .toArray();

  res.send(meals);
});





app.delete("/meals/:id", async (req, res) => {
  const result = await mealsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
  res.send(result);
});

app.get("/meals/by-chef/:email", async (req, res) => {
  const email = req.params.email;
  try {
    const result = await mealsCollection.find({ userEmail: email }).toArray();
    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Something went wrong", error });
  }
});






app.put("/meals/:id", async (req, res) => {
  const body = req.body;
  const updateDoc = {
    $set: body,
  };
  const result = await mealsCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    updateDoc
  );

  res.send(result);
});




 // CREATE MEAL (Chef adds a meal)
app.post("/meals", async (req, res) => {
  try {
    const meal = req.body;

    // automatic timestamp
    meal.createdAt = new Date();

    const result = await mealsCollection.insertOne(meal);

    res.send({
      success: true,
      message: "Meal created successfully",
      result
    });

  } catch (err) {
    res.status(500).send({
      success: false,
      message: "Meal creation failed",
      error: err
    });
  }
});





    app.post("/users", async (req, res) => {
  const user = req.body;

  const existingUser = await usersCollection.findOne({ email: user.email });
  if (existingUser) {
    return res.send({ message: "User already exists", insertedId: null });
  }

  const result = await usersCollection.insertOne({
    name: user.name,
    email: user.email,
    photo: user.photoURL,
    role: "user", 
    createdAt: new Date(),
  });

  res.send(result);
});



    const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader)
    return res.status(401).send({ message: "Unauthorized" });

  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err)
      return res.status(403).send({ message: "Forbidden" });

    req.decoded = decoded;
    next();
  });
};

const verifyAdmin = async (req, res, next) => {
  const email = req.decoded.email;
  const user = await usersCollection.findOne({ email });
  if (!user || user.role !== "admin") {
    return res.status(403).send({ message: "Access denied" });
  }
  next();
};


app.get("/all-users", verifyJWT, verifyAdmin, async (req, res) => {
  const users = await usersCollection.find().toArray();
  res.send(users);
});


// MAKE CHEF (Role Update)
app.put('/users/chef/:id', async (req, res) => {
  const id = req.params.id;

  const filter = { _id: new ObjectId(id) };
  const updateDoc = { $set: { role: "chef" } };

  const result = await usersCollection.updateOne(filter, updateDoc);
  res.send(result);
});


app.get('/users/:email', async (req, res) => {
  const email = req.params.email;
  const user = await usersCollection.findOne({ email });
  res.send(user);
});



 app.put("/chefs/status/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const { status } = req.body; // active / inactive

      try {
        const filter = { _id: new ObjectId(id) };
        const updateDoc = { $set: { status } };
        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "Failed to update chef status", error: err });
      }
    });




app.delete("/users/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const query = { _id: new ObjectId(id) };

    const result = await usersCollection.deleteOne(query);

    if (result.deletedCount === 0) {
      return res.status(404).send({
        success: false,
        message: "User not found!",
      });
    }

    res.send({
      success: true,
      message: "User deleted successfully",
      result,
    });

  } catch (error) {
    console.error("User delete failed:", error);
    res.status(500).send({
      success: false,
      message: "Internal Server Error",
    });
  }
});



app.patch("/users/admin/:id", async (req, res) => {
  const id = req.params.id;
  const filter = { _id: new ObjectId(id) };

  const updateDoc = {
    $set: { role: "admin" },
  };

  const result = await usersCollection.updateOne(filter, updateDoc);
  res.send(result);
});




// 🔹 Admin-only: Get all users
app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const users = await usersCollection.find().toArray();
    res.send(users);
  } catch (err) {
    res.status(500).send({ message: "Failed to fetch users", error: err });
  }
});

// 🔹 Admin-only: Get all chefs
app.get("/chefs", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const chefs = await usersCollection.find({ role: "chef" }).toArray();
    res.send(chefs);
  } catch (err) {
    res.status(500).send({ message: "Failed to fetch chefs", error: err });
  }
});

// 🔹 Admin-only: Get all orders
app.get("/orders", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const orders = await ordersCollection.find().toArray();
    res.send(orders);
  } catch (err) {
    res.status(500).send({ message: "Failed to fetch orders", error: err });
  }
});



    app.post("/jwt", (req, res) => {
  const email = req.body.email;

  const token = jwt.sign({ email }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  res.send({ token });
});

app.get("/home-reviews", async (req, res) => {
  try {
    const reviews = await reviewsCollection
      .find()
      .sort({ date: -1 })
      .limit(6)
      .toArray();

    res.send(reviews);
  } catch (err) {
    res.status(500).send({ message: "Failed to fetch home reviews", error: err });
  }
});


   




    console.log("MongoDB connected and chefsCollection ready");
  } catch(err) {
    console.error(err);
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Hello World!');
});




app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
