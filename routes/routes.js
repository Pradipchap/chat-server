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
const app = require("../index.js");
const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const { put, del } = require("@vercel/blob");
const dotenv=require("dotenv").config();

router.use(cookieParser());
const optimizeProfileImage = require("./optimizeProfile.js");
const { default: mongoose } = require("mongoose");
const { default: sendError } = require("../utils/sendError.js");

router.post("/users", authenticate, async (req, res) => {
  try {
    const userID = req.body.userID;
    const pageNo = (req.query.pageNo || 1) - 1;
    const limitingNumber = 10;
    console.log("user id is", userID);
    await connectToDB();
    const noOfUsers = await User.estimatedDocumentCount();
    console.log("no of users", noOfUsers);
    const users = await User.find({ _id: { $ne: new ObjectId(userID) } })
      .limit(limitingNumber)
      .skip(pageNo * limitingNumber);
    console.log("asd", users);
    res.status(200).json({
      users,
      noOfUsers: noOfUsers - 1,
    });
  } catch (error) {
    console.log("error is", error);
    res.status(200).json({
      error: {
        message: error,
      },
    });
  }
});
router.post("/chatters", authenticate, async (req, res) => {
  try {
    const userID = req.body.userID;
    const page = (req.query.page || 1) - 1;
    const limitingNumber = 12;
    await connectToDB();
    ////console.log(userID);
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
      { $skip: page * limitingNumber }, // Skip the first N results (for pagination)
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
          relation: { $literal: "FRIEND" },
          _id: 1,
          chatterID: { $arrayElemAt: ["$filteredParticipants", 0] }, // Extract the first (and only) element from the array
        },
      },
    ]);

    return res.json({ users: result });
  } catch (error) {
    console.log(error);
    res.status(200).json({
      error: {
        message: error,
      },
    });
  }
});

router.post("/chats", authenticate, async (req, res) => {
  try {
    const userID = req.body.userID;
    console.log(userID);
    const requestID = req.body.requestID;
    console.log(requestID);
    const documentID = getCombinedId(userID, requestID);
    //console.log("docuemtn id", documentID);
    const pageNo = req.body.page || 1;
    await connectToDB();
    //console.log("page is", pageNo);
    await Convo.aggregate([
      { $match: { combinedID: documentID } }, // Match the document by its ID
      {
        $project: {
          first10Messages: {
            $slice: ["$messages", 20 * (Number(pageNo) - 1), 20],
          },
          seen: 1,
        },
      },
    ])
      .then(async (result) => {
        if (result.length > 0) {
          // //console.log(result[0].first10Messages)
          return res.json({
            page: pageNo,
            messages: result[0].first10Messages,
            seen: result[0].seen,
          });
        } else {
          //console.log("Document not found");
          throw "";
        }
      })
      .catch((err) => {
        console.log(err);
        throw err;
      });
    // //console.log("messages are",messages)
  } catch (error) {
    console.log(error);
    res.status(200).json({
      error: {
        message: error,
      },
    });
  }
});

router.post("/getChatter", authenticate, async (req, res) => {
  try {
    const userID = req.body.userID;
    const requestID = req.body.requestID;
    await connectToDB();
    const combinedID = getCombinedId(userID, requestID);
    console.log("requestid", requestID);
    const isActive = requestID in app.users;
    const results = await Convo.aggregate([
      { $match: { combinedID } },
      {
        $project: {
          seen: 1,
          combinedID: 1,
          latestMessage: { $arrayElemAt: ["$messages", 0] },
          chatter: {
            $filter: {
              input: "$participants",
              as: "participant",
              cond: { $eq: ["$$participant", new ObjectId(requestID)] },
            },
          },
        },
      },
      {
        $project: {
          seen: 1,
          combinedID: 1,
          latestMessage: 1,
          chatterID: { $arrayElemAt: ["$chatter", 0] },
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
          chatterID: 1,
          _id: 1,
          combinedID: 1,
          seen: 1,
          latestMessage: 1,
          isActive: { $literal: isActive },
          participantDetails: { $arrayElemAt: ["$participantDetails", 0] }, // Extract the first (and only) element from the array
        },
      },
    ]);
    console.log("asdfas", results[0]);
    return res.json(results[0]);
  } catch (error) {
    console.log("error is", error);
    res.status(200).json({
      error: {
        message: JSON.stringify({ ...error }),
      },
    });
  }
});

router.post("/user", authenticate, async (req, res) => {
  const requestUserID = req.body.requestID;
  const userID = req.body.userID;
  console.log("request id", requestUserID);
  try {
    await connectToDB();
    const userDetails = await User.findById(requestUserID);
    console.log("userDetails", userDetails);
    return res.status(200).json({
      participantDetails: userDetails,
    });
    return;
  } catch (error) {
    res.status(500).json({
      error: {
        message: error,
      },
    });
  }
});
router.post("/notChatter", authenticate, async (req, res) => {
  const requestUserID = req.body.requestID;
  const userID = req.body.userID;
  try {
    await connectToDB();
    const details = await User.findById(requestUserID);
    console.log("hasIGotRequest", details);
    return res.status(200).json({
      participantDetails: details,
    });
  } catch (error) {
    return res.status(500).json({
      error: {
        message: error,
      },
    });
  }
});
router.post("/getRequested", authenticate, async (req, res) => {
  const requestUserID = req.body.userID;
  const userID = req.body.userID;
  try {
    await connectToDB();
    const hasIGotRequest = await FriendRequests.findOne(
      { userID: requestUserID, friendRequests: userID },
      {
        "friendRequests.$": 1,
      }
    ).populate({ path: "friendRequests" });
    console.log("getRequested", hasIGotRequest);
    return res.status(200).json({
      userDetails: hasIGotRequest.friendRequests[0],
    });
  } catch (error) {}
});

router.post("/sendFriendRequest", authenticate, async (req, res) => {
  const userID = req.body.userID;
  const friendUserID = req.body.requestID;
  console.log("req body is", req.body);
  const client = await connectToDB();

  if (!client) {
    return sendError(
      ErrorCodes.NORMAL,
      "Failed to connect to the database",
      res,
      500
    );
  }
  const session = await client.startSession();
  await session.startTransaction();
  try {
    const response = await FriendRequests.updateOne(
      { userID: friendUserID },
      { $addToSet: { friendRequests: userID } }
    );
    console.log("response is", response);
    return res.json({ message: "Friend Requests Sent" });
  } catch (error) {
    res.status(500).json({
      error: {
        message: error,
      },
    });
  }
});

router.post("/confirmRequest", authenticate, async (req, res) => {
  const userID = req.body.userID;
  const requestID = req.body.requestID;
  const combinedID = getCombinedId(userID, requestID);

  const client = await connectToDB();

  if (!client) {
    return sendError(
      ErrorCodes.NORMAL,
      "Failed to connect to the database",
      res,
      500
    );
  }
  const session = await client.startSession();
  await session.startTransaction();
  try {
    const ConvoDetails = await Convo.create(
      [
        {
          combinedID: combinedID,
          messages: [],
          seen: false,
          participants: [new ObjectId(userID), new ObjectId(requestID)],
        },
      ],
      { session }
    );
    console.log("convo is", ConvoDetails);
    await Friends.updateOne(
      { userID, "friends.userID": { $ne: requestID } },
      {
        $addToSet: {
          friends: { userID: requestID, convoID: ConvoDetails._id },
        },
      },
      { session }
    );
    await Friends.updateOne(
      { userID: requestID, "friends.userID": { $ne: userID } },
      { $addToSet: { friends: { userID, convoID: ConvoDetails._id } } },
      {
        session,
      }
    );
    await FriendRequests.updateOne(
      { userID },
      { $pull: { friendRequests: requestID } },
      { session }
    );
    await session.commitTransaction();
    return res.json({ convoID: ConvoDetails._id });
  } catch (error) {
    await session.abortTransaction();
    console.log("error is", error);
    if (error.code === 11000 && error.keyPattern.users) {
      console.error("Duplicate key error: users field has duplicate values.");
      return res.status(400).json({ error: "Duplicate values in users field" });
    } else {
      console.error("MongoDB error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } finally {
    await session.endSession();
  }
});
router.post("/deleteRequest", authenticate, async (req, res) => {
  const userID = req.body.userID;
  const requestID = req.body.requestID;
  ////console.log("asd", userID, requestID);
  const combinedID = getCombinedId(userID, requestID);

  try {
    await FriendRequests.updateOne(
      { userID },
      { $pull: { friendRequests: requestID } }
    );
    return res.json({});
  } catch (error) {
    ////console.log(error);
    return res.status(500).json({
      error: {
        message: error,
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
    ////console.log(error);
    return res.status(500).json({
      error: {
        message: error,
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
    console.log("fsd", result);
    return res.json({
      users: result[0].friendRequests,
      noOfUsers: result[0].totalFriendRequests,
    });
  } catch (error) {
    // console.log(error);
    return res.status(500).json({
      error: {
        message: error,
      },
    });
  }
});

router.post("/friends", authenticate, async (req, res) => {
  try {
    const userID = req.body.userID;
    ////console.log("user ID is", userID);
    const pageNo = (req.query.pageNo || 1) - 1;
    const limitingNumber = 10;
    ////console.log("page is", pageNo);
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
    ////console.log(result[0]);
    return res.json({
      users: result[0].populatedFriends,
      noOfUsers: result[0].totalFriends,
    });
  } catch (error) {
    res.status(500).json({
      error: {
        message: error,
      },
    });
  }
});

router.post("/deleteFriend", authenticate, async (req, res) => {
  const client = await connectToDB();

  if (!client) {
    return sendError(
      ErrorCodes.NORMAL,
      "Failed to connect to the database",
      res,
      500
    );
  }
  const session = await client.startSession();
  await session.startTransaction();
  try {
    const userID = req.body.userID;
    const friendID = req.body.friendID;
    const combinedID = getCombinedId(userID, friendID);
    await Convo.deleteOne({ combinedID }, { session });
    await Friends.updateOne(
      { userID },
      { $pull: { friends: { userID: friendID } } },
      {
        session,
      }
    );
    await Friends.updateOne(
      { userID: friendID },
      { $pull: { friends: { userID: userID } } },
      {
        session,
      }
    );
    await session.commitTransaction();
    return res.status(200).json({ message: "success" });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({
      error: {
        message: error,
      },
    });
  } finally {
    await session.endSession();
  }
});

router.post("/users/search", authenticate, async (req, res) => {
  try {
    const userID = req.body.userID;
    ////console.log("userasdf", userID);
    const searchString = req.body.searchString;
    ////console.log("params", searchString);
    console.log(userID, searchString);
    await connectToDB();
    const pipeline = [
      {
        $search: {
          index: "default",
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
      {
        $addFields: {
          searchedId: "$_id",
        },
      },
      {
        $lookup: {
          from: "friends",
          let: { userId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$userID", new ObjectId(userID)] } } },
            { $unwind: "$friends" },
            { $match: { $expr: { $eq: ["$friends.userID", "$$userId"] } } },
          ],
          as: "friendsData",
        },
      },
      {
        $addFields: {
          isFriend: { $gt: [{ $size: "$friendsData" }, 0] },
        },
      },
      {
        $lookup: {
          from: "friendrequests",
          let: { userId: "$_id", isFriend: "$isFriend" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$userID", new ObjectId(userID)] },
                    { $not: { $ifNull: ["$$isFriend", false] } },
                  ],
                },
              },
            },
            { $unwind: "$friendRequests" },
            { $match: { $expr: { $eq: ["$friendRequests", "$$userId"] } } },
          ],
          as: "friendRequestsData",
        },
      },
      {
        $addFields: {
          gotRequest: {
            $cond: {
              if: "$isFriend",
              then: false,
              else: { $gt: [{ $size: "$friendRequestsData" }, 0] },
            },
          },
        },
      },
      {
        $lookup: {
          from: "friendrequests",
          let: {
            userId: new ObjectId(userID),
            isFriend: "$isFriend",
            searchedId: "$searchedId",
            gotRequest: "$gotRequest",
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$userID", "$$searchedId"] },
                    {
                      $not: {
                        $ifNull: ["$$isFriend", false, "$$gotRequest", false],
                      },
                    },
                  ],
                },
              },
            },
            { $unwind: "$friendRequests" },
            { $match: { $expr: { $eq: ["$friendRequests", "$$userId"] } } },
          ],
          as: "friendRequestsData",
        },
      },
      {
        $addFields: {
          sentRequest: {
            $cond: {
              if: "$isFriend",
              then: false,
              else: { $gt: [{ $size: "$friendRequestsData" }, 0] },
            },
          },
        },
      },
      {
        $project: {
          _id: 1,
          chatterID: "$_id",
          relation: {
            $cond: {
              if: "$isFriend",
              then: "FRIEND",
              else: {
                $cond: {
                  if: "$gotRequest",
                  then: "GOTREQUEST",
                  else: {
                    $cond: {
                      if: "$sentRequest",
                      then: "SENTREQUEST",
                      else: "NORMAL",
                    },
                  },
                },
              },
            },
          },
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
    console.log(error);
    res.status(200).json({
      error: {
        message: error,
      },
    });
  }
});

router.post("/register", async (req, res) => {
  const { username, email, password } = req.body;
  const client = await connectToDB();

  if (!client) {
    return sendError(
      ErrorCodes.NORMAL,
      "Failed to connect to the database",
      res,
      500
    );
  }
  const session = await client.startSession();
  await session.startTransaction();

  try {
    const doesUserExists = await User.exists({ email });
    ////console.log("does user exists", doesUserExists);
    if (doesUserExists !== null) {
      res.status(403);
      return sendError(403, "User already exists", res);
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const x = Math.ceil((Math.random() + 0.1) * 1000000).toString();
    const verificationCode = x.slice(0, 6);
    const hashedCode = await bcrypt.hash(verificationCode.toString(), 10);

    const newUser = await User.create(
      [
        {
          username,
          email,
          image: "",
        },
      ],
      { session }
    );
    console.log("user id", newUser[0]._id);
    const newUserCredentials = await UserCredentials.create(
      [
        {
          email,
          password: hashedPassword,
          user: newUser[0]._id,
          code: hashedCode,
        },
      ],
      { session }
    );
    await Friends.create([{ userID: newUser[0]._id, friends: [] }], {
      session,
    });
    await FriendRequests.create(
      [{ userID: newUser[0]._id, friendRequests: [] }],
      { session }
    );
    await sendMail({
      to: email,
      subject: "verification",
      text: verificationCode.toString(),
    });
    await session.commitTransaction();
    res.send(JSON.stringify(newUser[0]));
    return;
  } catch (error) {
    await session.abortTransaction();
    res.status(error.status || 500);
    res.json({
      error: {
        message: error.message || "something wrong happened",
      },
    });
    return;
  } finally {
    await session.endSession();
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
    console.log(userDetail.user._id);
    const userVerifiedDate = await userDetail.verifiedAt;
    if (!userVerifiedDate) {
      res.status(401).json({
        error: {
          message: "User not Verified",
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
        image: userDetail.user.image,
        email: userDetail.user.email,
        username: userDetail.user.username,
        userID: userDetail.user._id,
        phone: userDetail.user.phone,
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
    console.log(error);
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
        message: "something wrong happened",
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
          message: "User not found",
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
        message: "Something wrong happened",
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
    ////console.log(isCodeCorrect);
    if (!isCodeCorrect) {
      res.status(401).json({
        error: {
          message: "Wrong verification code",
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
        message: "Something wrong happened",
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
          message: "sorry authentication failed",
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
        message: "Something wrong happened",
      },
    });
  }
});
router.post(
  "/editProfile",
  authenticate,
  upload.single("image"),
  async (req, res) => {
    const client = await connectToDB();

    if (!client) {
      return sendError(
        ErrorCodes.NORMAL,
        "Failed to connect to the database",
        res,
        500
      );
    }
    const session = await client.startSession();
    await session.startTransaction();

    try {
      const { userID, name, dateofbirth, phone } = req.body;
      await connectToDB();
      const profileImage = req.file;
      let imageUrl = "";
      if (
        typeof profileImage !== "undefined" &&
        profileImage.hasOwnProperty("size")
      ) {
        const fileName = profileImage.originalname.split(".")[0];
        const optimizedImage = await optimizeProfileImage(profileImage);
        console.log("first", process.env.MONGODB_URI);
        const imageDetails = await put(`${fileName}.webp`, optimizedImage, {
          access: "public",
          token: process.env.BLOB_READ_WRITE_TOKEN,
        });
        imageUrl = imageDetails.url;
      }
      if (imageUrl !== "") {
        const detailsBeforeUpdate = await User.findById(userID);
        console.log(detailsBeforeUpdate);
        if (detailsBeforeUpdate.image !== "") {
          console.log(detailsBeforeUpdate.image);
          await del(detailsBeforeUpdate.image, {
            token: process.env.BLOB_READ_WRITE_TOKEN,
          }).catch((err) => {
            throw "previous image not deleted";
          });
        }
      }

      const updatedProfile = await User.findByIdAndUpdate(
        userID,
        {
          ...(name !== "" ? { username: name } : {}),
          ...(dateofbirth !== "" ? { dateofbirth: dateofbirth } : {}),
          ...(phone !== "" ? { phone: phone } : {}),
          ...(imageUrl !== "" ? { image: imageUrl } : {}),
        },
        { new: true, session }
      );
      await session.commitTransaction();
      return res
        .status(200)
        .json({ message: "profile updated successfully", updatedProfile });
    } catch (error) {
      await session.abortTransaction();
      console.log(error);
      res.status(500).json({
        error: {
          message: "Something wrong happened",
        },
      });
    } finally {
      await session.endSession();
    }
  }
);

router.get("/", async (req, res) => {
  res.json({ message: "Hello world" });
  ////console.log(first)
});
module.exports = router;
