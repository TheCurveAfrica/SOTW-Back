require("dotenv").config({path: './config/index.env'});
const express =require("express");
const cors = require("cors");
const mongoose = require("mongoose")
const apiErrorHandler = require("./error/api-error-handler.js")
const PORT = process.env.PORT || 6000
const fileUpload = require("express-fileupload");
const swaggerJsdoc = require("swagger-jsdoc")
const swaggerDoc = require("swagger-ui-express")
const bodyParser = require('body-parser');

//middleware 
const app = express();
app.use(cors({
  credentials: true,
  origin: ['http://localhost:3000', 'https://the-curve.africa', 'http://localhost:5173', '*'], 
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], 
  allowedHeaders: ['Content-Type', 'Authorization'], 
}))
app.use(express.json());

//swagger 

// app.use(fileUpload({
//     useTempFiles: true,
//     limits:{ fileSize: 5 * 1024 * 1024 },
//     tempFileDir: '/tmp/',
//     debug: true,
// }));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

const options = { 
    definition: {
      openapi: "3.1.0",
      info: {
        title: "Students App API's",
        version: "0.1.0",
        description:
          "This is a simple CRUD API application made with Express and documented with Swagger",
        license: {
          name: "MIT",
          url: "https://spdx.org/licenses/MIT.html",
        },
        contact: {
          name: "LogRocket",
          url: "https://logrocket.com",
          email: "info@email.com",
        },
      },
      servers: [
        {
          url: "http://localhost:4400",
          description: 'Development server'
        },
      ],
    },
    apis: ["./router/*.js"],
  };

  const specs = swaggerJsdoc(options);
app.use(
  "/api-docs",
  swaggerDoc.serve,
  swaggerDoc.setup(specs, { explorer: true })
);

 
//database collection
const url = process.env.URL;
// console.log(url)
mongoose.connect(url).then(()=>{
    app.listen(PORT, ()=> console.log(`Server on ${PORT} now up and db connected...`))
}).catch((err)=> console.log(`error connecting to db ${err}`));

//to display in the browser
app.get("/", async (req, res)=>{
    res.send("Student of the week platform")
});


const router = require('./routes/userRouter.js');

app.use('/api/v1', router);

//api routes
app.use("/users", require("./routes/users.js"));
app.use("/tutors", require("./routes/tutors"));
app.use("/rating", require("./routes/ratings"));
app.use("/vote", require("./routes/vote"));
app.use("/SOW", require("./routes/SOW"));
app.use("/BSOW", require("./routes/BSOW"));
app.use("/PSOW", require("./routes/PSOW"));
app.use("/Alumni", require("./routes/Alumni"));
app.use('/student', require('./routes/monthlyRouter.js'));

//algorithm route
app.use("/algo", require("./routes/SOTWAlgorithm"))

//assignment management routes (consolidated)
app.use("/api", require("./routes/assignmentManagement"));

app.use("/api", require("./routes/registration"));

//error middleware
app.use(apiErrorHandler);