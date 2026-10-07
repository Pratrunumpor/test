const express = require('express');
const app = express();
app.use(express.json());

let latestCommand = "OFF";

// ตั้งค่า Channel Access Token ของ LINE Bot คุณ
const CHANNEL_ACCESS_TOKEN = "EEaMRFWfkwXaZVIa4DSiIVj+B3FMoAjgJBXa7YP+QQPbSDuKBkVVd4ScIczJcal1sQq1OsOyFlR8VmcWA4GLHCmM8xhkbcvcFXljzpzBOAqbYcVdM9jIJ0x4lHvojlUTvlRDb05JjG5l3Inl1GZ+ewdB04t89/1O/w1cDnyilFU=";

// ฟังก์ชันดึงข้อมูลสภาพอากาศตามพิกัดที่คุณต้องการ
async function getWeatherInfo() {
  try {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=16.419&longitude=101.1606&timezone=Asia%2FBangkok&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,rain,cloud_cover,wind_speed_10m,weather_code';
    
    const response = await fetch(url);
    const data = await response.json();

    // ดึงชั่วโมงปัจจุบันตามเวลาประเทศไทย (Asia/Bangkok) อย่างแม่นยำ (0-23)
    const bangkokHourStr = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Bangkok',
      hour: 'numeric',
      hour12: false
    }).format(new Date());
    
    let currentHourIndex = parseInt(bangkokHourStr);
    if (isNaN(currentHourIndex) || currentHourIndex > 23) {
      currentHourIndex = 0;
    }

    // ป้องกัน Error กรณีข้อมูลอาเรย์ยังไม่มา
    const temp = data.hourly?.temperature_2m?.[currentHourIndex] ?? '-';
    const humidity = data.hourly?.relative_humidity_2m?.[currentHourIndex] ?? '-';
    const precipProb = data.hourly?.precipitation_probability?.[currentHourIndex] ?? '-';
    const rain = data.hourly?.rain?.[currentHourIndex] ?? '-';
    const cloud = data.hourly?.cloud_cover?.[currentHourIndex] ?? '-';
    const wind = data.hourly?.wind_speed_10m?.[currentHourIndex] ?? '-';

    let report = `🌤 สภาพอากาศล่าสุด:\n`;
    report += `🌡 อุณหภูมิ: ${temp} °C\n`;
    report += `💧 ความชื้น: ${humidity} %\n`;
    report += `🌧 โอกาสฝนตก: ${precipProb} %\n`;
    report += `💧 ปริมาณฝน: ${rain} มม.\n`;
    report += `☁️ เมฆปกคลุม: ${cloud} %\n`;
    report += `💨 ความเร็วลม: ${wind} กม./ชม.`;

    return report;
  } catch (error) {
    console.error("Error fetching weather details:", error);
    return "⚠️ ไม่สามารถดึงข้อมูลสภาพอากาศภายนอกได้ในขณะนี้นะจ๊ะ";
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

    if (userMessage === "check" || userMessage === "เช็ค") {
      latestCommand = "check";
      await replyLineMessage(replyToken, "🔄 กำลังเรียกข้อมูลจาก NodeMCU...");
    } 
    else if (userMessage === "weather" || userMessage === "สภาพอากาศ" || userMessage === "เช็คสภาพอากาศ") {
      const weatherInfo = await getWeatherInfo();
      await replyLineMessage(replyToken, weatherInfo);
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
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
