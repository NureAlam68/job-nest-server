require("dotenv").config();
const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const port = process.env.PORT || 3000;
const app = express();

app.use(
  cors({
    origin: ["http://localhost:5173", "https://jobnest-1fa99.web.app", "https://jobnest-1fa99.firebaseapp.com"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const verifyToken = (req, res, next) => {
  const token = req?.cookies?.token;

  if (!token) {
    return res.status(401).send({ message: "unAuthorized access" });
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "unAuthorized access" });
    }
    req.user = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.8kdu5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const jobsCollections = client.db("jobNest").collection("jobs");
    const jobApplicationsCollections = client
      .db("jobNest")
      .collection("jobApplications");

    // Auth related apis (jwt)
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "5h",
      });

      res

        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
        })
        .send({ success: true });
    });

    app.post("/logout", (req, res) => {
      res
        .clearCookie("token", {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
        })
        .send({ success: true });
    });

    // jobs related apis
    app.get("/jobs", async (req, res) => {
      const email = req.query.email;
      const category = req.query?.category;
      const sort = req.query?.sort;
      const search = req.query?.search;
      const min = req.query?.min;
      const max = req.query?.max;
      let query = {};
      let sortQuery = {};

       // Combine filters
    if (email) query.hr_email = email;
    if (category) query.category = category;
    
      if(sort == "true") {
        sortQuery = {"salaryRange.min": -1}
      }

      if(search) {
        query.location = {$regex: search, $options: "i"}
      }

      if(min && max) {
        query = {
          ...query,  // new query added
          "salaryRange.min": {$gte: parseInt(min)},
          "salaryRange.max": {$lte: parseInt(max)}
        }
      }

      const cursor = jobsCollections.find(query).sort(sortQuery);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/jobs/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await jobsCollections.findOne(query);
      res.send(result);
    });

    app.get("/latest-job", async (req, res) => {
      const cursor = jobsCollections.find().sort({ _id: -1 }).limit(8);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/jobs", async (req, res) => {
      const newJob = req.body;
      const result = await jobsCollections.insertOne(newJob);
      res.send(result);
    });

    // job applications apis

    app.get("/job-applications", verifyToken, async (req, res) => {
      const email = req.query.email;
      const query = { applicant_email: email };

      if (req.user.email !== req.query.email) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      const result = await jobApplicationsCollections.find(query).toArray();

      // not the best way to aggregate data
      for (const application of result) {
        const query = { _id: new ObjectId(application.job_id) };
        const job = await jobsCollections.findOne(query);
        if (job) {
          application.title = job.title;
          application.location = job.location;
          application.company = job.company;
          application.company_logo = job.company_logo;
          application.category = job.category;
          application.applicationDeadline = job.applicationDeadline;
        }
      }

      res.send(result);
    });

    app.get("/job-applications/jobs/:job_id", async (req, res) => {
      const jobId = req.params.job_id;
      const query = { job_id: jobId };
      const result = await jobApplicationsCollections.find(query).toArray();
      res.send(result);
    });

    app.post("/job-applications", async (req, res) => {
      const application = req.body;
      const result = await jobApplicationsCollections.insertOne(application);

      // not the best way ( skip it)
      const id = application.job_id;
      const query = { _id: new ObjectId(id) };
      const job = await jobsCollections.findOne(query);
      let count = 0;
      if (job.applicationCount) {
        count = job.applicationCount + 1;
      } else {
        count = 1;
      }

      // update job application info
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          applicationCount: count,
        },
      };

      const updateResult = await jobsCollections.updateOne(filter, updatedDoc);

      res.send(result);
    });

    app.patch("/job-applications/:id", async (req, res) => {
      const id = req.params.id;
      const data = req.body;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          status: data.status,
        },
      };
      const result = await jobApplicationsCollections.updateOne(
        filter,
        updatedDoc
      );
      res.send(result);
    });

    app.delete("/job-applications/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await jobApplicationsCollections.deleteOne(query);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("JobNest server is running...");
});

app.listen(port, () => {
  console.log(`JobNest server is running on port ${port}`);
});
