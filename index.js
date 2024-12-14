require("dotenv").config();
const express = require('express');
const cors = require('cors');
const port = process.env.PORT || 3000;
const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.send('JobNest server is running...')
})

app.listen(port, () => {
    console.log(`JobNest server is running on port ${port}`)
})