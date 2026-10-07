const express = require('express');
const app = express();
app.use(express.json());

let latestCommand = "OFF";

async function getWeatherAndAstroInfo() {
  try {
    // พิกัดตัวอย่าง: อุบลราชธานี (Lat: 15.2285, Lng: 104.8569)
    // ดึงข้อมูลสภาพอากาศ, ฝน, ลม, เมฆ, จุดน้ำค้าง และข้อมูลดวงอาทิตย์/ดวงจันทร์
    const weatherUrl = 'https://api.open-meteo.com/v1/forecast?latitude=15.2285&longitude=104.8569&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m&hourly=precipitation_probability,precipitation,dew_point_2m&daily=sunrise,sunset,moonrise,moonset,moon_phase&timezone=Asia%2FBangkok';
    
    // ดึงข้อมูล PM2.5 / AQI เพิ่มเติม
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

    // แปลงข้อมูลดวงจันทร์คร่าวๆ จาก moon_phase (0 = New Moon, 0.5 = Full Moon)
    let moonPhaseText = "ข้างขึ้น / ข้างแรม";
    const phase = daily.moon_phase[0];
    if (phase < 0.05 || phase > 0.95) moonPhaseText = "🌑 	จันทร์ดับ (New Moon)";
    else if (phase < 0.25) moonPhaseText = "🌒 ข้างขึ้น";
    else if (phase < 0.3) moonPhaseText = "🌓 จันทร์ครึ่งดวง (First Quarter)";
    else if (phase < 0.5) moonPhaseText = "🌔 ข้างขึ้น";
    else if (phase < 0.55) moonPhaseText = "🌕 จันทร์เต็มดวง (Full Moon)";
    else if (phase < 0.75) moonPhaseText = "🌖 ข้างแรม";
    else if (phase < 0.8) moonPhaseText = "🌗 จันทร์ครึ่งดวง (Last Quarter)";
    else moonPhaseText = "🌘 ข้างแรม";

    // จัดรูปแบบข้อความรายงานสภาพอากาศและดาราศาสตร์
    let report = `🌤 สภาพอากาศและดาราศาสตร์:\n`;
    report += `☀️ พระอาทิตย์ขึ้น: ${daily.sunrise[0].split('T')[1]} | ตก: ${daily.sunset[0].split('T')[1]}\n`;
    report += `🌙 พระจันทร์ขึ้น: ${daily.moonrise[0] ? daily.moonrise[0].split('T')[1] : 'N/A'} | ตก: ${daily.moonset[0] ? daily.moonset[0].split('T')[1] : 'N/A'}\n`;
    report += `🌕 ดวงจันทร์: ${moonPhaseText}\n`;
    report += `💨 ความเร็วลม: ${curr.wind_speed_10m} กม./ชม. (ทิศ ${curr.wind_direction_10m}°)\n`;
    report += `☁️ เมฆปกคลุม: ${curr.cloud_cover}%\n`;
    report += `💧 จุดน้ำค้าง (Dew Point): ${curr.dew_point_2m} °C\n`;
    report += `🌧 ปริมาณฝน: ${curr.precipitation} มม. (โอกาสฝนตก: ${weatherData.hourly.precipitation_probability[0]}%)\n`;
    report += `😷 PM2.5: ${airCurr.pm2_5} µg/m³ (AQI: ${airCurr.us_aqi})`;

    return report;
  } catch (error) {
    console.error("Error fetching weather/astro:", error);
    return "⚠️ ไม่สามารถดึงข้อมูลสภาพอากาศภายนอกได้ในขณะนี้";
  }
}

app.post('/webhook', (req, res) => {
  const events = req.body.events;
  if (events && events.length > 0) {
    const userMessage = events[0].message.text.trim();
    if (userMessage === "เปิด" || userMessage === "ON") latestCommand = "ON";
    else if (userMessage === "ปิด" || userMessage === "OFF") latestCommand = "OFF";
    else if (userMessage === "check" || userMessage === "เช็ค") latestCommand = "check";
  }
  res.sendStatus(200);
});

app.get('/command', async (req, res) => {
  if (latestCommand === "check") {
    const weatherInfo = await getWeatherAndAstroInfo();
    res.send(`check|${weatherInfo}`);
    latestCommand = "OFF";
  } else {
    res.send(latestCommand);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
