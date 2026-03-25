const axios = require("axios");

// ─── GET ACCESS TOKEN ───
async function getAccessToken() {
  try {
    const response = await axios.post(
      `https://login.microsoftonline.com/${process.env.GRAPH_TENANT_ID}/oauth2/v2.0/token`,
      new URLSearchParams({
        client_id: process.env.GRAPH_CLIENT_ID,
        client_secret: process.env.GRAPH_CLIENT_SECRET,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      })
    );

    return response.data.access_token;
  } catch (err) {
    console.error("❌ Error getting access token:", err.response?.data || err.message);
    throw new Error("Failed to authenticate with Microsoft Graph");
  }
}


// ─── SEND MAIL ───
async function sendMail(to, subject, html) {
  try {
    const token = await getAccessToken();

    await axios.post(
      `https://graph.microsoft.com/v1.0/users/${process.env.GRAPH_SENDER_EMAIL}/sendMail`,
      {
        message: {
          subject: subject,
          body: {
            contentType: "HTML",
            content: html,
          },
          toRecipients: [
            {
              emailAddress: {
                address: to,
              },
            },
          ],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(`📧 Email sent to ${to}`);
    return true;

  } catch (err) {
    console.error("❌ Error sending email:", err.response?.data || err.message);
    return false; // do NOT crash your app
  }
}

module.exports = { sendMail };