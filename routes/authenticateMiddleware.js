const jwt = require("jsonwebtoken");

function authenticate(req, res, next) {
  try {
    const token = req.headers["authorization"].split(" ")[1];
    if (!token) {
      res.status(401).json({ error: "access denied" });
    }
    console.log("token", token);
    const isCorrect = jwt.verify(token, process.env.JWT_SECRET);
    req.body.userID = isCorrect.userID;
    next();
  } catch (error) {
    res.status(401).json({
      error: {
        errormessage: error,
      },
    });
  }
}

module.exports = authenticate;
