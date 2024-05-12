const {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} = require("node:worker_threads");
const Convo = require("../models/ConvoModel");

if (isMainThread) {
  module.exports = function savemessage(script) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(__filename, {
        workerData: script,
      });
      worker.on("message", resolve);
      worker.on("error", reject);
      worker.on("exit", (code) => {
        if (code !== 0)
          reject(new Error(`Worker stopped with exit code ${code}`));
      });
    });
  };
} else {
  (async () => {
    try {
      const { sender, receiver, message } = workerData;
      const documentID =
        sender < receiver ? sender + receiver : receiver + sender;
      const doesConversationExists = await Convo.create({
				messages:[]
			})
      console.log(doesConversationExists);
      parentPort.postMessage(message);
    } catch (error) {
			console.log("message not saved",error)
		}
  })()
}
