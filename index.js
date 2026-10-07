const express = require('express');
const app = express();
app.use(express.json());

let latestCommand = "OFF";

// ตั้งค่า Channel Access Token ของ LINE Bot และ WeatherAPI Key ของคุณ
const CHANNEL_ACCESS_TOKEN = "EEaMRFWfkwXaZVIa4DSiIVj+B3FMoAjgJBXa7YP+QQPbSDuKBkVVd4ScIczJcal1sQq1OsOyFlR8VmcWA4GLHCmM8xhkbcvcFXljzpzBOAqbYcVdM9jIJ0x4lHvojlUTvlRDb05JjG5l3Inl1GZ+ewdB04t89/1O/w1cDnyilFU=";
const WEATHER_API_KEY = "151f50fc23134b6fa2c170835260710"; // ใส่ API Key ของ WeatherAPI ที่นี่

// ฟังก์ชันดึงข้อมูลสภาพอากาศจาก WeatherAPI.com
async function getWeatherInfo() {
  try {
    // เปลี่ยนมาใช้ forecast.json เพื่อดึงข้อมูลดาราศาสตร์ (ดวงอาทิตย์/ดวงจันทร์) และโอกาสฝนตกรายวัน
    const lat = "16.419";
    const lon = "101.1606";
    const url = `https://api.weatherapi.com/v1/forecast.json?key=${WEATHER_API_KEY}&q=${lat},${lon}&days=1&aqi=yes`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      console.error("WeatherAPI Error:", data.error.message);
      return `⚠️ ข้อผิดพลาด: ${data.error.message}`;
    }

    const current = data.current;
    const astro = data.forecast.forecastday[0].astro;
    const day = data.forecast.forecastday[0].day;

    const temp = current.temp_c;
    const humidity = current.humidity;
    const condition = current.condition.text;
    const rain = current.precip_mm;
    const cloud = current.cloud;
    const wind = current.wind_kph;
    const pm25 = current.air_quality?.pm2_5 ? current.air_quality.pm2_5.toFixed(1) : 'N/A';
    const aqi = current.air_quality?.['us-epa-index'] ?? 'N/A';

    // ข้อมูลดาราศาสตร์และโอกาสฝน
    const sunrise = astro.sunrise;
    const sunset = astro.sunset;
    const moonrise = astro.moonrise;
    const moonset = astro.moonset;
    const moonPhase = astro.moon_phase; // เช่น Waxing Gibbous, Full Moon ฯลฯ
    const moonIllumination = astro.moon_illumination; // ความสว่างดวงจันทร์เป็น %
    const precipChance = day.daily_chance_of_rain; // โอกาสเกิดฝนตกเป็น %

    // คำนวณโอกาสเกิดหมอกเป็นเปอร์เซ็นต์ (%) จากความชื้น เมฆ และลมนิ่ง
    // สูตรคำนวณเบื้องต้น: ยิ่งความชื้นสูงและลมนิ่ง โอกาสเกิดหมอกยิ่งสูง
    let fogPercent = Math.min(Math.round(((humidity - 50) / 50) * 100), 100);
    if (fogPercent < 0) fogPercent = 0;
    if (cloud > 80 && humidity > 85) {
      fogPercent = Math.min(fogPercent + 20, 99); // ปรับเพิ่มถ้าเมฆต่ำและความชื้นจัด
    }

    let report = `🌤 สภาพอากาศ (เขาค้อ-ภูทับเบิก):\n`;
    report += `🌡 อุณหภูมิ: ${temp} °C (${condition})\n`;
    report += `💧 ความชื้น: ${humidity} %\n`;
    report += `🌧 ปริมาณฝน: ${rain} มม. (โอกาสฝนตก: ${precipChance}%)\n`;
    report += `☁️ เมฆปกคลุม: ${cloud} %\n`;
    report += `💨 ความเร็วลม: ${wind} กม./ชม.\n`;
    report += `😷 PM2.5: ${pm25} µg/m³ (AQI: ${aqi})\n`;
    report += `🌫 โอกาสเกิดหมอก: ${fogPercent} %\n`;
    report += `\n🌙 ข้อมูลดาราศาสตร์:\n`;
    report += `☀️ พระอาทิตย์ขึ้น: ${sunrise} | ตก: ${sunset}\n`;
    report += `🌙 พระจันทร์ขึ้น: ${moonrise} | ตก: ${moonset}\n`;
    report += `🌕 ข้างขึ้นข้างแรม: ${moonPhase}\n`;
    report += `✨ ความสว่างดวงจันทร์: ${moonIllumination} %`;

    return report;
  } catch (error) {
    console.error("Fetch Error:", error);
    return "⚠️ ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์สภาพอากาศได้ในขณะนี้";
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
