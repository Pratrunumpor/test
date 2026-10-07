const express = require('express');
const app = express();
app.use(express.json());

let latestCommand = "OFF";

// ตั้งค่า Channel Access Token ของ LINE Bot คุณ
const CHANNEL_ACCESS_TOKEN = "EEaMRFWfkwXaZVIa4DSiIVj+B3FMoAjgJBXa7YP+QQPbSDuKBkVVd4ScIczJcal1sQq1OsOyFlR8VmcWA4GLHCmM8xhkbcvcFXljzpzBOAqbYcVdM9jIJ0x4lHvojlUTvlRDb05JjG5l3Inl1GZ+ewdB04t89/1O/w1cDnyilFU=";

// ฟังก์ชันดึงข้อมูลสภาพอากาศและดาราศาสตร์จากภายนอก (สำหรับเมนูที่ 2)
async function getWeatherAndAstroInfo() {
  try {
    const weatherUrl = 'https://api.open-meteo.com/v1/forecast?latitude=15.2285&longitude=104.8569&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m&hourly=precipitation_probability&daily=sunrise,sunset&timezone=Asia%2FBangkok';
    const airQualityUrl = 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=15.2285&longitude=104.8569&current=pm2_5,us_aqi&timezone=Asia%2FBangkok';

    const [weatherRes, airRes] = await Promise.all([
      fetch(weatherUrl),
      fetch(airQualityUrl)
    ]);

    const weatherData = await weatherRes.json();
    const airData = await airRes.json();

    const curr = weatherData.current;
    const daily = weatherData.daily;
    const airCurr = airData.current;

    let report = `🌤 สภาพอากาศและสิ่งแวดล้อม:\n`;
    report += `☀️ พระอาทิตย์ขึ้น: ${daily.sunrise[0].split('T')[1]} | ตก: ${daily.sunset[0].split('T')[1]}\n`;
    report += `💨 ความเร็วลม: ${curr.wind_speed_10m} กม./ชม.\n`;
    report += `☁️ เมฆปกคลุม: ${curr.cloud_cover}%\n`;
    report += `🌧 ปริมาณฝน: ${curr.precipitation} มม. (โอกาสฝนตก: ${weatherData.hourly.precipitation_probability[0]}%)\n`;
    report += `😷 PM2.5: ${airCurr.pm2_5} µg/m³ (AQI: ${airCurr.us_aqi})`;

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

    // เมนูที่ 1: ส่งคำสั่ง check ไปให้ NodeMCU ดึงไปประมวลผล
    if (userMessage === "check" || userMessage === "เช็ค") {
      latestCommand = "check";
      await replyLineMessage(replyToken, "🔄 กำลังเรียกข้อมูลจาก NodeMCU...");
    } 
    // เมนูที่ 2: ดึงข้อมูลสภาพอากาศส่งกลับเข้า LINE ทันทีโดย Render
    else if (userMessage === "weather" || userMessage === "สภาพอากาศ" || userMessage === "เช็คสภาพอากาศ") {
      const weatherInfo = await getWeatherAndAstroInfo();
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
