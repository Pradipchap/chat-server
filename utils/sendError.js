const ErrorCodes = require("../constants");

function sendError(
  errorCode,
  message,
  res,
  statusCode
) {
  res.status(statusCode || 500);
  return res.json({
    error: {
      message:message,
      errorCode: ErrorCode,
    },
  });
}
module.exports=sendError;
