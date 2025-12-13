const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors');
const jwt = require("jsonwebtoken");
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);


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
    const favoritesCollection = db.collection('favorite');
    const ordersCollection = db.collection('orders');
    const paymentsCollection = db.collection('payments');



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




    app.post("/requests", async (req, res) => {
  try {
    const request = req.body; 
    const result = await requestsCollection.insertOne(request);
    res.send({ success: true, result });
  } catch (err) {
    res.status(500).send({ success: false, message: "Failed to create request", error: err });
  }
});


app.post("/create-payment-intent", verifyJWT, async (req, res) => {
  const { price } = req.body;
  const amount = parseInt(price * 100); // Stripe amount requires cents

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: "usd",
      payment_method_types: ["card"],
    });

    res.send({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({ error: "Payment Intent Failed" });
  }
});


app.post("/payments", verifyJWT, async (req, res) => {
  const payment = req.body;

  try {
    // Save payment history
    const paymentResult = await paymentsCollection.insertOne(payment);

    // Update order payment status
    await ordersCollection.updateOne(
      { _id: new ObjectId(payment.orderId) },
      { $set: { paymentStatus: "paid" } }
    );

    res.send({ success: true, paymentResult });
  } catch (err) {
    console.log(err);
    res.status(500).send({ error: "Payment Save Failed" });
  }
});


// GET order by ID
app.get("/orders/:id", verifyJWT, async (req, res) => {
  try {
    const orderId = req.params.id;
    const order = await ordersCollection.findOne({ _id: new ObjectId(orderId) });
    if (!order) {
      return res.status(404).send({ error: "Order not found" });
    }
    res.send(order);
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to fetch order" });
  }
});


// Example: server/index.js
app.patch("/orders/:id/pay", async (req, res) => {
  const orderId = req.params.id;
  const { paymentInfo } = req.body; // payment result বা stripe info

  try {
    const result = await ordersCollection.updateOne(
      { _id: new ObjectId(orderId) },
      { $set: { paymentStatus: "paid", paymentInfo } }
    );

    if (result.modifiedCount) {
      res.send({ success: true });
    } else {
      res.status(400).send({ success: false, message: "Failed to update order" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Server error" });
  }
});



app.get("/reviews/user/:name", verifyJWT, async (req, res) => {
  try {
    const name = req.params.name;
    const reviews = await reviewsCollection
      .find({ reviewerName: name })
      .sort({ date: -1 })
      .toArray();
    res.send(reviews);
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to fetch reviews" });
  }
});

// Delete a review
app.delete("/reviews/:id", verifyJWT, async (req, res) => {
  try {
    const id = req.params.id;
    const result = await reviewsCollection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount) {
      res.send({ success: true });
    } else {
      res.status(404).send({ success: false, message: "Review not found" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to delete review" });
  }
});

// Update a review
app.patch("/reviews/:id", verifyJWT, async (req, res) => {
  try {
    const id = req.params.id;
    const { rating, comment } = req.body;
    const result = await reviewsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { rating, comment } }
    );
    if (result.modifiedCount) {
      res.send({ success: true });
    } else {
      res.status(400).send({ success: false, message: "Failed to update review" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to update review" });
  }
});



// Get favorite meals by user email
app.get("/favorites/user/:email", verifyJWT, async (req, res) => {
  try {
    const email = req.params.email;
    const favorites = await favoritesCollection
      .find({ userEmail: email })
      .sort({ dateAdded: -1 })
      .toArray();
    res.send(favorites);
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to fetch favorite meals" });
  }
});

// Delete favorite meal
app.delete("/favorites/:id", verifyJWT, async (req, res) => {
  try {
    const id = req.params.id;
    const result = await favoritesCollection.deleteOne({ _id: new ObjectId(id) });
    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to remove favorite meal" });
  }
});

const verifyFraudUser = async (req, res, next) => {
  try {
    const email = req.user.email;

    const user = await usersCollection.findOne({ email });

    if (!user) {
      return res.status(401).send({ message: "User not found" });
    }

    if (user.status === "fraud") {
      return res.status(403).send({
        message: "Fraud users cannot place orders",
      });
    }

    next();
  } catch (error) {
    res.status(500).send({
      message: "Fraud verification failed",
      error,
    });
  }
};


app.patch("/users/fraud/:id", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const id = req.params.id;

    const result = await usersCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "fraud" } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).send({ message: "User not found" });
    }

    res.send({
      success: true,
      message: "User marked as fraud successfully",
    });
  } catch (error) {
    console.error("Make Fraud Error:", error);
    res.status(500).send({ message: "Failed to mark user as fraud" });
  }
});





app.post("/orders", verifyJWT, async (req, res) => {
  try {
    const email = req.decoded.email;

    const user = await usersCollection.findOne({ email });

    if (!user) {
      return res.status(404).send({ message: "User not found" });
    }

    if (user.status === "fraud") {
      return res.status(403).send({
        message: "Fraud users cannot place orders",
      });
    }

    const order = {
      ...req.body,
      userEmail: email, // 🔒 frontend এর email ignore
      createdAt: new Date(),
    };

    const result = await ordersCollection.insertOne(order);
    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Order failed" });
  }
});




app.get("/orders", verifyJWT, async (req, res) => {
  try {
    const orders = await ordersCollection.find().toArray();
    res.send(orders);
  } catch (err) {
    res.status(500).send({ error: "Failed to fetch orders" });
  }
});



app.patch("/orders/:id/status", verifyJWT, async (req, res) => {
  const { status } = req.body; 
  const orderId = req.params.id;

  try {
    const result = await ordersCollection.updateOne(
      { _id: new ObjectId(orderId) },
      { $set: { orderStatus: status } }
    );

    if (result.modifiedCount) {
      return res.send({ success: true });
    } else {
      return res.status(400).send({ success: false, message: "Failed to update order" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Server error" });
  }
});


app.get("/orders/user/:email", verifyJWT, async (req, res) => {
  const email = req.params.email;

  const result = await ordersCollection.find({ userEmail: email }).toArray();
  res.send(result);
});




app.get("/meals", async (req, res) => {
  const sort = req.query.sort === "desc" ? -1 : 1;

  const meals = await mealsCollection
    .find()
    .sort({ price: sort })
    .toArray();

  res.send(meals);
});


app.post("/reviews", async (req, res) => {
  const result = await reviewsCollection.insertOne(req.body);
  res.send(result);
});

app.get("/meals/:id", async (req, res) => {
  const id = req.params.id;
  const query = { _id: new ObjectId(id) };
  const result = await mealsCollection.findOne(query);
  res.send(result);
});


app.post("/favorites", async (req, res) => {
  const { userEmail, mealId } = req.body;

  const exist = await favoritesCollection.findOne({ userEmail, mealId });
  if (exist) return res.send({ message: "already_exist" });

  const result = await favoritesCollection.insertOne(req.body);
  res.send(result);
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




app.post("/meals", verifyJWT, async (req, res) => {
  try {
    const email = req.decoded.email;
    const chef = await usersCollection.findOne({ email });

    if (!chef) return res.status(404).send({ message: "Chef not found" });
    if (chef.status === "fraud") return res.status(403).send({ message: "Fraud chefs cannot create meals" });

    const meal = {
      ...req.body,
      chefId: chef._id,
      chefEmail: chef.email,
      createdAt: new Date(),
    };

    const result = await mealsCollection.insertOne(meal);

    res.send({ success: true, message: "Meal created successfully", result });
  } catch (err) {
    console.error("Create meal error:", err);
    res.status(500).send({ success: false, message: "Meal creation failed", error: err.message });
  }
});


app.get("/admin/platform-stats", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    // মোট ইউজার
    const totalUsers = await usersCollection.countDocuments();

    // অর্ডারের স্ট্যাটাস অনুযায়ী গণনা
    const ordersPending = await ordersCollection.countDocuments({ orderStatus: "pending" });
    const ordersDelivered = await ordersCollection.countDocuments({ orderStatus: "delivered" });

    // মোট পেমেন্ট
    const payments = await paymentsCollection.aggregate([
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]).toArray();
    const totalPayments = payments[0]?.total || 0;

    res.send({
      totalUsers,
      ordersPending,
      ordersDelivered,
      totalPayments,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Server error" });
  }
});




app.get("/role-requests", verifyJWT, verifyAdmin, async (req, res) => {
const result = await requestsCollection.find().sort({ requestTime: -1 }).toArray();
res.send(result);
});



// ==========================
// Role Requests PATCH Route
// ==========================
app.patch("/role-requests/:id", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params; // string id
    const { action } = req.body;

    // 🔹 Directly query with string _id
    const request = await requestsCollection.findOne({ _id: id });
    if (!request) {
      return res.status(404).send({ message: "Request not found" });
    }

    // ===== APPROVE =====
    if (action === "approve") {
      const updateUser = {};

      if (request.requestType === "chef") {
        updateUser.role = "chef";
        updateUser.chefId = `chef-${Math.floor(1000 + Math.random() * 9000)}`;
      }

      if (request.requestType === "admin") {
        updateUser.role = "admin";
      }

      await usersCollection.updateOne(
        { email: request.userEmail },
        { $set: updateUser }
      );

      await requestsCollection.updateOne(
        { _id: id },
        { $set: { requestStatus: "approved" } }
      );

      return res.send({ success: true, message: "Request approved" });
    }

    // ===== REJECT =====
    if (action === "reject") {
      await requestsCollection.updateOne(
        { _id: id },
        { $set: { requestStatus: "rejected" } }
      );

      return res.send({ success: true, message: "Request rejected" });
    }

    // ===== INVALID ACTION =====
    res.status(400).send({ message: "Invalid action" });
  } catch (error) {
    console.error("PATCH /role-requests/:id error:", error);
    res.status(500).send({ message: "Server error" });
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





app.get("/all-users", verifyJWT, verifyAdmin, async (req, res) => {
  const users = await usersCollection.find().toArray();
  res.send(users);
});


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
      const { status } = req.body; 

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




app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const users = await usersCollection.find().toArray();
    res.send(users);
  } catch (err) {
    res.status(500).send({ message: "Failed to fetch users", error: err });
  }
});

app.get("/chefs", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const chefs = await usersCollection.find({ role: "chef" }).toArray();
    res.send(chefs);
  } catch (err) {
    res.status(500).send({ message: "Failed to fetch chefs", error: err });
  }
});

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
