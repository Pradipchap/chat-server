const jwt = require("jsonwebtoken");
async function authenticate(req, res, next) {
  try {
    const token = req.headers["authorization"].split(" ")[1];
    if (!token) {
      res.status(401).json({ error: "access denied" });
    }
    const isCorrect = jwt.verify(token, process.env.JWT_SECRET);
    if(!isCorrect){
      res.status(401).json({ error: "access denied" });
    }
    if (req.headers["content-type"].split(";")[0]!=="multipart/form-data") {
      req.body.userID = isCorrect.userID;
    }
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
