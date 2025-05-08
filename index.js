const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors"); // Import CORS

const corsOptions = require("./config/cors"); // Import CORS options
const config = require("./config");
const apiRoutes = require("./routes"); // Assuming routes/index.js aggregates all routes under /api
const errorHandler = require("./middleware/errorHandler");
const startServer = require("./server/server");

const app = express();

// --- Essential Middleware ---

// CORS Configuration
// Allow requests from your frontend domain, including credentials (cookies)

app.use(cors(corsOptions));

// Body Parsers
app.use(express.json({ limit: "1mb" })); // Limit payload size
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Cookie Parser
app.use(cookieParser());

// --- Application Routes ---
app.use("/api/v1", apiRoutes); // Mount all aggregated API routes (which should include /api prefix internally)

// --- Optional: Root route for basic check ---
app.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(`<html><body><h1>Auth API (${config.env}) is running.</h1><a href="/api/v1/health">Check Health</a></body></html>`);
});

// --- Global Error Handler ---
// This must be the LAST middleware added
app.use(errorHandler);

startServer(app);
