const nodemailer = require("nodemailer");
const  {google}  = require("googleapis");
const OAuth2 = google.auth.OAuth2;

async function createTransporter() {
  const oauth2Client = new OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    "https://developers.google.com/oauthplayground"
  );
  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  const accessToken = await oauth2Client.getAccessToken();

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: process.env.USER_EMAIL,
      accessToken,
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
    },
  });
  return transporter;
}

async function sendMail({ to, subject, text="Hello world", html }) {
  try {
    const emailTransporter = await createTransporter();
    const mailOptions = {
      from: process.env.USER_EMAIL,
      to,
      subject,
      text,
      html,
    };
    console.log("mail sent successfully");
    await emailTransporter.sendMail(mailOptions);
  } catch (err) {
    console.log("ERROR: ", err);
		throw new Error("couldn't send mail")
  }
}
module.exports = sendMail;
