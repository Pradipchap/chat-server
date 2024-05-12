const express = require("express");
const router = express.Router();
router.use(express.json());
const connectToDB = require("../utils/database");
const User = require("../models/UserModel");
const UserCredentials = require("../models/UserCredentials");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const authenticate = require("./authenticateMiddleware");
const sendMail = require("./mailsender");
const ErrorCodes = require("../constants");
const cookieParser = require("cookie-parser");
const { randomUUID } = require("crypto");
const Friends = require("../models/FriendsModel");
const FriendRequests = require("../models/FriendRequests");
const getCombinedId = require("../utils/getCombinedId");
const { ObjectId } = require("mongodb");
const Convo = require("../models/ConvoModel");

router.use(cookieParser());

router.post("/users", authenticate, async (req, res) => {
  try {
    const userID = req.body.userID;
    const pageNo = (req.query.pageNo || 1) - 1;
    const limitingNumber = 10;
    await connectToDB();
    const noOfUsers = await User.estimatedDocumentCount();
    console.log("no of users", noOfUsers);
    const users = await User.find({ _id: { $ne: new ObjectId(userID) } })
      .limit(limitingNumber)
      .skip(pageNo * limitingNumber);
    res.status(200).json({
      users,
      noOfUsers: noOfUsers - 1,
    });
  } catch (error) {
    res.status(200).json({
      error: {
        errorMessage: error,
      },
    });
  }
});
router.post("/chatters", authenticate, async (req, res) => {
  try {
    const userID = req.body.userID;
    const pageNo = (req.query.pageNo || 1) - 1;
    const limitingNumber = 10;
    await connectToDB();
    console.log(userID);
    // await Convo.findByIdAndUpdate("66269d8923e9f5554a7f00fc",

    // { $addToSet: { messages: { sender: "66269bd4d48d8e15fc5b6c04", message: "k xa khabar" } } })
    const result = await Friends.aggregate([
      // Match the document where the userID matches the given userId
      { $match: { userID: new ObjectId(userID) } },
      // Unwind the friends array to deconstruct the array
      { $unwind: "$friends" },
      // Lookup the conversation details for each friend
      {
        $lookup: {
          from: "convos", // Assuming the collection name is 'convos'
          localField: "friends.convoID",
          foreignField: "_id",
          as: "conversation",
        },
      },
      // Unwind the conversation array to deconstruct the array
      { $unwind: "$conversation" },
      // Sort the conversations by updatedAt timestamp in descending order
      { $sort: { "conversation.updatedAt": -1 } },
      { $skip: pageNo * limitingNumber }, // Skip the first N results (for pagination)
      { $limit: limitingNumber },
      // Group the conversations by combinedID to remove duplicates
      {
        $group: {
          _id: "$conversation.combinedID",
          conversation: { $first: "$conversation" },
        },
      },
      // Replace root to reshape the document structure
      { $replaceRoot: { newRoot: "$conversation" } },
      // Project to include only the latest message
      {
        $project: {
          filteredParticipants: {
            $filter: {
              input: "$participants",
              as: "participant",
              cond: { $ne: ["$$participant", new ObjectId(userID)] },
            },
          },
        },
      },
      {
        $project: {
          _id: 1,
          chatterID: { $arrayElemAt: ["$filteredParticipants", 0] }, // Extract the first (and only) element from the array
        },
      },
    ]);

    return res.json({ users: result });
  } catch (error) {
    res.status(200).json({
      error: {
        errorMessage: error,
      },
    });
  }
});

router.post("/getChatter", authenticate, async (req, res) => {
  try {
    const userID = req.body.userID;
    const requestID = req.body.requestID;
    await connectToDB();
    console.log(userID);

    const combinedID = getCombinedId(userID, requestID);

    const results = await Convo.aggregate([
      { $match: { combinedID } },
      {
        $project: {
          _id: 1,
          combinedID: 1,
          latestMessage: { $arrayElemAt: ["$messages", 0] },
          chatterID: {
            $filter: {
              input: "$participants",
              as: "participant",
              cond: { $eq: ["$$participant", new ObjectId(requestID)] },
            },
          },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "chatterID",
          foreignField: "_id",
          as: "participantDetails",
        },
      },
      {
        $project: {
          _id: 1,
          combinedID: 1,
          latestMessage: 1,
          participantDetails: { $arrayElemAt: ["$participantDetails", 0] }, // Extract the first (and only) element from the array
        },
      },
    ]);
    console.log("result are",results)
    return res.json( results[0] );
  } catch (error) {
    res.status(200).json({
      error: {
        errorMessage: error,
      },
    });
  }
});

router.post("/user", authenticate, async (req, res) => {
  const requestUserID = req.query.userID;
  const userID = req.body.userID;
  try {
    await connectToDB();

    const isFriend = await Friends.findOne(
      { userID, "friends.userID": requestUserID },
      {
        "friends.$": 1,
      }
    ).populate({ path: "friends.userID" });
    if (isFriend) {
      return res.status(200).json({
        isFriend: true,
        hasIGotRequest: false,
        hasISentRequest: false,
        userDetails: isFriend.friends[0].userID,
      });
      return;
    }
    const hasIGotRequest = await FriendRequests.findOne(
      { userID, friendRequests: requestUserID },
      {
        "friendRequests.$": 1,
      }
    ).populate({ path: "friendRequests" });
    if (hasIGotRequest) {
      return res.status(200).json({
        isFriend: false,
        hasIGotRequest: true,
        hasISentRequest: false,
        userDetails: hasIGotRequest.friendRequests[0],
      });
      return;
    }
    const hasISentRequest = await FriendRequests.findOne(
      { userID: requestUserID, friendRequests: userID },
      {
        "friendRequests.$": 1,
      }
    ).populate("userID");
    if (hasISentRequest) {
      return res.status(200).json({
        isFriend: false,
        hasIGotRequest: false,
        hasISentRequest: true,
        userDetails: hasISentRequest.userID,
      });
      return;
    }
    const userDetails = await User.findById(requestUserID);
    return res.status(200).json({
      isFriend: false,
      userDetails,
      hasIGotRequest: false,
      hasISentRequest: false,
    });
    return;
  } catch (error) {
    res.status(500).json({
      error: {
        errorMessage: error,
      },
    });
  }
});

router.post("/sendFriendRequest", authenticate, async (req, res) => {
  console.log("first");
  const userID = req.body.userID;
  const friendUserID = req.body.friendID;
  console.log("req body is", req.body);
  try {
    await connectToDB();
    const response = await FriendRequests.updateOne(
      { userID: friendUserID },
      { $addToSet: { friendRequests: userID } }
    );
    return res.json({ message: "Friend Requests Sent" });
  } catch (error) {
    res.status(500).json({
      error: {
        errorMessage: error,
      },
    });
  }
});

router.post("/confirmRequest", authenticate, async (req, res) => {
  const userID = req.body.userID;
  const requestID = req.body.requestID;
  console.log("asd", userID, requestID);
  const combinedID = getCombinedId(userID, requestID);
  console.log("cas", combinedID);
  try {
    const ConvoDetails = await Convo.create({
      combinedID: combinedID,
      messages: [],
      participants: [new ObjectId(userID), new ObjectId(requestID)],
    });
    console.log("convo is", ConvoDetails);
    await Friends.updateOne(
      { userID, "friends.userID": { $ne: requestID } },
      {
        $addToSet: {
          friends: { userID: requestID, convoID: ConvoDetails._id },
        },
      }
    );
    await Friends.updateOne(
      { userID: requestID, "friends.userID": { $ne: userID } },
      { $addToSet: { friends: { userID, convoID: ConvoDetails._id } } }
    );
    await FriendRequests.updateOne(
      { userID },
      { $pull: { friendRequests: requestID } }
    );
    return res.json({});
  } catch (error) {
    if (error.code === 11000 && error.keyPattern.users) {
      console.error("Duplicate key error: users field has duplicate values.");
      return res.status(400).json({ error: "Duplicate values in users field" });
    } else {
      console.error("MongoDB error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
});
router.post("/deleteRequest", authenticate, async (req, res) => {
  const userID = req.body.userID;
  const requestID = req.body.requestID;
  console.log("asd", userID, requestID);
  const combinedID = getCombinedId(userID, requestID);

  try {
    await FriendRequests.updateOne(
      { userID },
      { $pull: { friendRequests: requestID } }
    );
    return res.json({});
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      error: {
        errorMessage: error,
      },
    });
  }
});
router.post("/unsendRequest", authenticate, async (req, res) => {
  const userID = req.body.userID;
  const requestID = req.body.requestID;
  try {
    await FriendRequests.updateOne(
      { userID: requestID },
      { $pull: { friendRequests: userID } }
    );
    return res.json({});
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      error: {
        errorMessage: error,
      },
    });
  }
});

router.post("/getFriendRequests", authenticate, async (req, res) => {
  const userID = req.body.userID;
  const pageNo = (req.query.pageNo || 1) - 1;
  const limitingNumber = 10;
  console.log("req body is", userID);
  try {
    await connectToDB();
    const result = await FriendRequests.aggregate([
      { $match: { userID: new ObjectId(userID) } },
      {
        $project: {
          totalFriendRequests: { $size: "$friendRequests" },
          friendRequests: { $slice: ["$friendRequests", pageNo * 10, 10] },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "friendRequests",
          foreignField: "_id",
          as: "populatedFriendRequests",
        },
      },
      {
        $addFields: {
          friendRequests: [{ $arrayElemAt: ["$populatedFriendRequests", 0] }],
        },
      },
      {
        $project: {
          "friendRequests.userID": 0,
          populatedFriendRequests: 0,
        },
      },
    ]);
    return res.json({
      users: result[0].friendRequests,
      noOfUser: result[0].totalFriendRequests,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      error: {
        errorMessage: error,
      },
    });
  }
});

router.post("/friends", authenticate, async (req, res) => {
  try {
    const userID = req.body.userID;
    console.log("user ID is", userID);
    const pageNo = (req.query.pageNo || 1) - 1;
    const limitingNumber = 10;
    console.log("page is", pageNo);
    await connectToDB();
    const result = await Friends.aggregate([
      { $match: { userID: new ObjectId(userID) } },
      {
        $project: {
          totalFriends: { $size: "$friends" },
          friends: { $slice: ["$friends", pageNo * 10, 10] },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "friends.userID",
          foreignField: "_id",
          as: "populatedFriends",
        },
      },
      // {
      //   $addFields: {
      //     friends: [{ $arrayElemAt: ["$populatedFriends", 0] }],
      //   },
      // },
      {
        $project: {
          "friends.userID": 0,
          // friends: 0,
        },
      },
    ]);
    console.log(result[0]);
    return res.json({
      users: result[0].populatedFriends,
      noOfUsers: result[0].totalFriends,
    });
  } catch (error) {
    res.status(500).json({
      error: {
        errorMessage: error,
      },
    });
  }
});

router.post("/deleteFriend", authenticate, async (req, res) => {
  try {
    const userID = req.body.userID;
    const friendID = req.body.friendID;
    const combinedID = getCombinedId(userID, friendID);
    await connectToDB();
    await Convo.deleteOne({ combinedID });
    await Friends.updateOne(
      { userID },
      { $pull: { friends: { userID: friendID } } }
    );
    await Friends.updateOne(
      { userID: friendID },
      { $pull: { friends: { userID: userID } } }
    );
    return res.status(200).json({ message: "success" });
  } catch (error) {
    res.status(500).json({
      error: {
        errorMessage: error,
      },
    });
  }
});

router.post("/users/search", authenticate, async (req, res) => {
  try {
    const userID = req.body.userID;
    console.log("userasdf", userID);
    const searchString = req.body.searchString;
    console.log("params", searchString);
    await connectToDB();
    const pipeline = [
      {
        $search: {
          index: "usersSearch",
          autocomplete: {
            query: searchString,
            path: "username",
          },
        },
      },
      {
        $match: {
          _id: { $ne: new ObjectId(userID) },
        },
      },
    ];
    const users = await User.aggregate(pipeline).limit(10);
    console.log("users are", users);
    res.status(200).json({
      users,
      noOfUser: users.length,
    });
  } catch (error) {
    res.status(200).json({
      error: {
        errorMessage: error,
      },
    });
  }
});

router.post("/register", async (req, res) => {
  const { username, email, password } = req.body;
  console.log("body", username, email, password);
  try {
    const websocketId = randomUUID();
    await connectToDB();
    const doesUserExists = await User.exists({ email });
    console.log("does user exists", doesUserExists);
    if (doesUserExists !== null) {
      res.status(403);
      res.json({
        error: {
          errorMessage: "User already exists",
          errorCOde: ErrorCodes.USER_EXISTS,
        },
      });
      return;
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const x = Math.ceil((Math.random() + 0.1) * 1000000).toString();
    const verificationCode = x.slice(0, 6);
    const hashedCode = await bcrypt.hash(verificationCode.toString(), 10);
    await sendMail({
      to: email,
      subject: "verification",
      text: verificationCode.toString(),
    });
    const newUser = await User.create({
      username,
      email,
      websocketId,
    });
    console.log("user id", newUser._id);
    const newUserCredentials = await UserCredentials.create({
      email,
      password: hashedPassword,
      user: newUser._id,
      code: hashedCode,
    });
    await Friends.create({ userID: newUser._id, friends: [] });
    await FriendRequests.create({ userID: newUser._id, friendRequests: [] });
    res.send(JSON.stringify(newUser));
    return;
  } catch (error) {
    res.status(error.status || 500);
    res.json({
      error: {
        errorMessage: error.message || "something wrong happened",
      },
    });
    return;
  }
});

router.post("/login", async (req, res) => {
  try {
    await connectToDB();
    const { email, password } = req.body;
    const userDetail = await UserCredentials.findOne({ email }).populate(
      "user"
    );
    if (!userDetail) {
      throw new Error("User doesn't exists");
    }
    const userVerifiedDate = await userDetail.verifiedAt;
    if (!userVerifiedDate) {
      res.status(401).json({
        error: {
          errorMessage: "User not Verified",
          errorCode: ErrorCodes.EMAIL_NOT_VERIFIED,
        },
      });
    }

    const isPasswordCorrect = await bcrypt.compare(
      password,
      userDetail.password
    );
    if (isPasswordCorrect) {
      const token = jwt.sign(
        { userID: userDetail.user._id },
        process.env.JWT_SECRET,
        {
          expiresIn: 86400,
        }
      );
      res.status(200);
      res.cookie("accessToken", token, { maxAge: 86400 });
      res.json({
        accessToken: token,
        email: userDetail.user.email,
        username: userDetail.user.username,
        userID: userDetail.user._id,
        websockedId: userDetail.user.websockedId,
      });
      return;
    } else {
      throw new Error("password doesn't match");
      return;
    }
  } catch (error) {
    res.status(error.status || 500);
    res.json({
      error: {
        message: error.message || "something wrong happened",
      },
    });
    return;
  }
});

router.get("/test", authenticate, async (req, res) => {
  try {
    await connectToDB();
    const UserDetails = await UserCredentials.findOne({
      email: "shanticpgn@gmail.com",
    }).populate("userid");
    res.send(UserDetails);
  } catch (error) {
    res.send("unsuccess");
  }
});

router.post("/verifyemail", async (req, res) => {
  const verificationCode = req.body.code;
  const email = req.body.email;
  try {
    await connectToDB();
    const credentials = await UserCredentials.findOne({ email });
    const isCorrectCode = await bcrypt.compare(
      verificationCode.toString(),
      credentials.code
    );
    if (!isCorrectCode) {
      res.status(401).json({
        error: {
          message: "Wrong verifcation code",
        },
      });
    } else {
      await UserCredentials.findByIdAndUpdate(credentials._id, {
        verifiedAt: new Date(),
      });
      res.status(200).json({ message: "Email successfully verified" });
    }
  } catch (error) {
    res.status(500).json({
      error: {
        errorMessage: "something wrong happened",
      },
    });
  }
});

router.post("/forgotPassword", async (req, res) => {
  try {
    await connectToDB();
    const email = req.body.email;
    const user = await User.findOne({ email });
    if (!user) {
      res.status(500).json({
        error: {
          errorMessage: "User not found",
          errorCode: ErrorCodes.USER_NOT_FOUND,
        },
      });
    }
    const code = Math.ceil(Math.random() * 1000000);
    const encryptedCode = await bcrypt.hash(code.toString(), 10);
    await sendMail({
      to: email,
      text: code.toString(),
      subject: "verification code",
    });
    await UserCredentials.findOneAndUpdate({ email }, { code: encryptedCode });
    res.status(200).json({ message: "verification code sent successfully" });
  } catch (error) {
    res.status(500).json({
      error: {
        errorMessage: "Something wrong happened",
      },
    });
  }
});

router.post("/verifyCode", async (req, res) => {
  const { email, code } = req.body;
  try {
    await connectToDB();
    const userCredentials = await UserCredentials.findOne({ email });
    const isCodeCorrect = await bcrypt.compare(
      code.toString(),
      userCredentials.code
    );
    console.log(isCodeCorrect);
    if (!isCodeCorrect) {
      res.status(401).json({
        error: {
          errorMessage: "Wrong verification code",
          errorCode: ErrorCodes.WRONG_CODE,
        },
      });
    }
    const newVerificationCodeForChangingPassword = Math.ceil(
      Math.random() * 1000000
    );
    const encryptedCode = await bcrypt.hash(
      newVerificationCodeForChangingPassword.toString(),
      10
    );
    await UserCredentials.findByIdAndUpdate(userCredentials._id, {
      code: encryptedCode,
    });
    res
      .status(200)
      .cookie(
        "changePasswordCode",
        newVerificationCodeForChangingPassword.toString(),
        { maxAge: 60 * 60 }
      )
      .json({ message: "Verification successfull" });
  } catch (error) {
    res.status(500).json({
      error: {
        errorMessage: "Something wrong happened",
      },
    });
  }
});

router.post("/changePassword", async (req, res) => {
  const changePasswordCode = req.cookies.changepasswordcode;
  const { email, password } = req.body;
  try {
    await connectToDB();
    const credentials = await UserCredentials.findOne({ email });
    const isCorrectCode = await bcrypt.compare(
      changePasswordCode.toString(),
      credentials.code
    );
    if (!isCorrectCode) {
      res.status(201).json({
        error: {
          errorMessage: "sorry authentication failed",
          errorCode: ErrorCodes.WRONG_CODE,
        },
      });
    }
    const encryptedPassword = await bcrypt.hash(password, 10);
    const updatedUserCredentials = await UserCredentials.findOneAndUpdate(
      { email },
      { password: encryptedPassword }
    );
    res.status(200).json({
      message: "password changed successfully",
    });
  } catch (error) {
    res.status(500).json({
      error: {
        errorMessage: "Something wrong happened",
      },
    });
  }
});

router.get("/",async(req,res)=>{
  res.json({message:"Hello world"})
  console.log(first)
});
module.exports = router;
