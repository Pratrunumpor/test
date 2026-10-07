const express = require('express');
const app = express();
app.use(express.json());

let latestCommand = "OFF";

// ตั้งค่า Channel Access Token ของ LINE Bot คุณ
const CHANNEL_ACCESS_TOKEN = "EEaMRFWfkwXaZVIa4DSiIVj+B3FMoAjgJBXa7YP+QQPbSDuKBkVVd4ScIczJcal1sQq1OsOyFlR8VmcWA4GLHCmM8xhkbcvcFXljzpzBOAqbYcVdM9jIJ0x4lHvojlUTvlRDb05JjG5l3Inl1GZ+ewdB04t89/1O/w1cDnyilFU=";

// ฟังก์ชันดึงข้อมูลสภาพอากาศจาก URL ที่คุณกำหนด
async function getWeatherInfo() {
  try {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=16.419&longitude=101.1606&timezone=Asia%2FBangkok&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,rain,cloud_cover,wind_speed_10m,weather_code';
    
    const response = await fetch(url);
    const data = await response.json();

    // ดึงค่าตามชั่วโมงปัจจุบัน (ชั่วโมง 0-23 ของวัน)
    const currentHourIndex = new Date().getHours();

    const temp = data.hourly.temperature_2m[currentHourIndex];
    const humidity = data.hourly.relative_humidity_2m[currentHourIndex];
    const precipProb = data.hourly.precipitation_probability[currentHourIndex];
    const rain = data.hourly.rain[currentHourIndex];
    const cloud = data.hourly.cloud_cover[currentHourIndex];
    const wind = data.hourly.wind_speed_10m[currentHourIndex];

    let report = `🌤 สภาพอากาศล่าสุด:\n`;
    report += `🌡 อุณหภูมิ: ${temp} °C\n`;
    report += `💧 ความชื้น: ${humidity} %\n`;
    report += `🌧 โอกาสฝนตก: ${precipProb} %\n`;
    report += `💧 ปริมาณฝน: ${rain} มม.\n`;
    report += `☁️ เมฆปกคลุม: ${cloud} %\n`;
    report += `💨 ความเร็วลม: ${wind} กม./ชม.`;

    return report;
  } catch (error) {
    console.error("Error fetching weather:", error);
    return "⚠️ ไม่สามารถดึงข้อมูลสภาพอากาศภายนอกได้ในขณะนี้";
  }
}

// ฟังก์ชันส่งข้อความตอบกลับทาง LINE ทันที (Reply API)
async function replyLineMessage(replyToken, textMessage) {
  try {
    await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        replyToken: replyToken,
        messages: [{ type: 'text', text: textMessage }]
      })
    });
  } catch (error) {
    console.error("Error replying to LINE:", error);
  }
}

app.post('/webhook', async (req, res) => {
  const events = req.body.events;
  if (events && events.length > 0) {
    const event = events[0];
    const userMessage = event.message.text.trim();
    const replyToken = event.replyToken;

    console.log("Receive from LINE: " + userMessage);

    // เมนูที่ 1: ส่งคำสั่ง check ไปให้ NodeMCU
    if (userMessage === "check" || userMessage === "เช็ค") {
      latestCommand = "check";
      await replyLineMessage(replyToken, "🔄 กำลังเรียกข้อมูลจาก NodeMCU...");
    } 
    // เมนูที่ 2: ดึงข้อมูลสภาพอากาศตาม API ที่กำหนดส่งกลับเข้า LINE ทันที
    else if (userMessage === "weather" || userMessage === "สภาพอากาศ" || userMessage === "เช็คสภาพอากาศ") {
      const weatherInfo = await getWeatherInfo();
      await replyLineMessage(replyToken, weatherInfo);
    }
  }
  res.sendStatus(200);
});

// Endpoint ให้ NodeMCU เข้ามาเช็กคำสั่ง
app.get('/command', (req, res) => {
  res.send(latestCommand);
  if (latestCommand === "check") {
    latestCommand = "OFF"; // เคลียร์ค่ากลับหลัง NodeMCU ดึงไปแล้ว
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
