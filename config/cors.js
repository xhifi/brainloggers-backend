const config = require(".");

const cors = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    // or from the configured client URL
    if (!origin || origin === config.clientUrl) {
      callback(null, true);
    } else {
      callback(new Error(`Not allowed by CORS: ${origin}`));
    }
  },
  credentials: true,
};

module.exports = cors;
