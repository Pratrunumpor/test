const express = require('express');
const app = express();
app.use(express.json());

let latestCommand = "OFF";

app.post('/webhook', (req, res) => {
  const events = req.body.events;
  if (events && events.length > 0) {
    const userMessage = events[0].message.text.trim();
    console.log("Receive from LINE: " + userMessage);
    
    if (userMessage === "เปิด" || userMessage === "ON"|| userMessage === "on"|| userMessage === "On") {
      latestCommand = "ON";
    } else if (userMessage === "ปิด" || userMessage === "OFF"|| userMessage === "off"|| userMessage === "Off") {
      latestCommand = "OFF";
    } else if (userMessage === "check" || userMessage === "เช็ค"|| userMessage === "Check") {
      latestCommand = "check";
    }
  }
  res.sendStatus(200);
});

app.get('/command', (req, res) => {
  res.send(latestCommand);
  if (latestCommand === "check") {
    latestCommand = "OFF";
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
