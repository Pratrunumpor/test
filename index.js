const express = require('express');
const app = express();
app.use(express.json());

let latestCommand = "OFF", savedUserId = null;
let lastAlertDate = { "เขาค้อ-ภูทับเบิก จ.เพชรบูรณ์": "", "อ.วารินชำราบ จ.อุบลราชธานี": "" };

const CHANNEL_ACCESS_TOKEN = "YOUR_LINE_TOKEN"; // ใส่ Token
const WEATHER_API_KEY = "151f50fc23134b6fa2c170835260710";

// ชุดคำสั่ง IoT (ใช้ Set เพื่อความเร็ว O(1) ในการค้นหา)
const IOT_COMMANDS = new Set([
  "เปิด1", "ปิด1", "กระพริบ1", "เปิด2", "ปิด2", "กระพริบ2", 
  "เปิด3", "ปิด3", "กระพริบ3", "เปิด4", "ปิด4", "กระพริบ4", 
  "เปิดทั้งหมด", "ปิดทั้งหมด", "กระพริบทั้งหมด", "หยุดกระพริบ"
]);

// 1. ฟังก์ชันตัวช่วย (Helpers) ลดความซับซ้อน
const getThaiDate = () => new Date().toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

const to24H = (t) => {
  if (!t) return 'N/A';
  const m = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return t.split(' ')[1] || t;
  let [_, h, min, mod] = m;
  h = parseInt(h);
  if (mod.toUpperCase() === 'PM' && h < 12) h += 12;
  if (mod.toUpperCase() === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${min}`;
};

const getUvAdvice = (uv) => 
  uv <= 2 ? { l: "ต่ำ", a: "ปลอดภัย ทำกิจกรรมได้ปกติ" } :
  uv <= 5 ? { l: "ปานกลาง", a: "ควรสวมแว่น/ทาครีมกันแดด" } :
  uv <= 7 ? { l: "สูง", a: "⚠️ เลี่ยงแดด 10:00-16:00 น. สวมหมวก/ร่ม" } :
  uv <= 10 ? { l: "สูงมาก", a: "⚠️⚠️ งดกิจกรรมกลางแจ้ง 10:00-16:00 น." } :
  { l: "รุนแรงที่สุด", a: "🚨🚨 อันตราย! เลี่ยงการโดนแดดเด็ดขาด" };

const footerMsg = `\n-----------------------------------\n📍 แชร์โลเคชั่นเพื่อดูสภาพอากาศพื้นที่อื่นได้\n📖 คู่มือ:\n• เปิด/ปิด/กระพริบ (1-4, ทั้งหมด, หยุด)\n• weather (รายงาน 2 พื้นที่)\n• check (ดูสถานะอุปกรณ์)`;

// 2. รวมฟังก์ชัน LINE API (Reply & Push อยู่ในฟังก์ชันเดียว)
async function lineApi(type, to, messages) {
  if (type === 'reply' && messages.length) messages[messages.length - 1].text += footerMsg;
  try {
    await fetch(`https://api.line.me/v2/bot/message/${type}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}` },
      body: JSON.stringify({ [type === 'reply' ? 'replyToken' : 'to']: to, messages })
    });
  } catch (e) { console.error("LINE API Error:", e); }
}

// 3. ฟังก์ชันสภาพอากาศ (ใช้ Destructuring และ Array Methods ลดโค้ด)
async function getWeatherInfo(lat, lon, locName) {
  try {
    const { error, current: c, forecast } = await (await fetch(`https://api.weatherapi.com/v1/forecast.json?key=${WEATHER_API_KEY}&q=${lat},${lon}&days=1&aqi=yes`)).json();
    if (error) throw new Error(error.message);

    const { astro, day, hour = [] } = forecast.forecastday[0];
    const maxH = hour.reduce((m, h) => h.temp_c > m.temp_c ? h : m, hour[0] || {});
    const minH = hour.reduce((m, h) => h.temp_c < m.temp_c ? h : m, hour[0] || {});
    const uv = getUvAdvice(c.uv);
    const fog = Math.min(Math.max(Math.round(((c.humidity - 50) / 50) * 100) + (c.cloud > 80 && c.humidity > 85 ? 20 : 0), 0), 99);
    const isRain = /thunder|storm|rain/i.test(c.condition.text);

    const text = `📅 ${getThaiDate()}
-----------------------------------
🌤 สภาพอากาศ (${locName}):
🌡 อุณหภูมิปัจจุบัน: ${c.temp_c}°C (รู้สึกจริง ${c.feelslike_c}°C)
📈 สูงสุด: ${day.maxtemp_c}°C (${to24H(maxH.time)} น.) | 📉 ต่ำสุด: ${day.mintemp_c}°C (${to24H(minH.time)} น.)
💬 สภาพอากาศ: ${c.condition.text}
💧 ความชื้น: ${c.humidity}% | จุดน้ำค้าง: ${c.dewpoint_c}°C
🌧 ปริมาณฝน: ${c.precip_mm} มม. (โอกาสตก: ${day.daily_chance_of_rain}%)
⚡ พายุ: ${isRain ? "⚠️ มีพายุฝน" : (day.daily_chance_of_rain > 70 ? "เฝ้าระวัง" : "ปกติ")}
☁️ เมฆ: ${c.cloud}% | ฐานเมฆ: ${Math.round((c.temp_c - c.dewpoint_c) * 125) || 'N/A'} ม.
💨 ลม: ${c.wind_kph} กม./ชม. (${c.wind_dir}) | 👀 มองเห็น: ${c.vis_km} กม.
☀️ UV: ${c.uv} [${uv.l}] -> ${uv.a}
😷 PM2.5: ${c.air_quality?.pm2_5?.toFixed(1) || 'N/A'} µg/m³ (AQI: ${c.air_quality?.['us-epa-index'] || 'N/A'})
🌫 โอกาสหมอก: ${fog}%

🌙 ดาราศาสตร์:
ขึ้น/ตก ☀️: ${to24H(astro.sunrise)} / ${to24H(astro.sunset)} น. | 🌙: ${to24H(astro.moonrise)} / ${to24H(astro.moonset)} น.
🌕 แรม/ขึ้น: ${astro.moon_phase} (${astro.moon_illumination}% สว่าง)`;

    return { text, rainChance: day.daily_chance_of_rain, cond: c.condition.text };
  } catch (err) {
    return { text: `⚠️ Error (${locName}): ${err.message}`, rainChance: 0, cond: "" };
  }
}

// 4. ระบบแจ้งเตือนฝนตกรายชั่วโมง (รันแบบขนานด้วย Promise.all)
setInterval(async () => {
  if (!savedUserId) return;
  const locs = [{ lat: "16.419", lon: "101.1606", n: "เขาค้อ-ภูทับเบิก จ.เพชรบูรณ์" }, { lat: "15.195", lon: "104.872", n: "อ.วารินชำราบ จ.อุบลราชธานี" }];
  const today = new Date().toDateString();

  await Promise.all(locs.map(async ({ lat, lon, n }) => {
    const { rainChance, cond } = await getWeatherInfo(lat, lon, n);
    if ((rainChance > 60 || /rain|thunder|storm/i.test(cond)) && lastAlertDate[n] !== today) {
      lastAlertDate[n] = today;
      lineApi('push', savedUserId, [{ type: 'text', text: `🚨 **แจ้งเตือน (${n})** 🚨\n⚠️ แนวโน้มฝนตก!\n🌧 โอกาส: ${rainChance}%\n💬 ลักษณะ: ${cond}\n💡 ควรเก็บผ้าหรือเตรียมรับมือครับ` }]);
    }
  }));
}, 3600000);

// 5. Webhook ยุบการตรวจสอบ (Switch & Set)
app.post('/webhook', async (req, res) => {
  const event = req.body.events?.[0];
  if (!event) return res.sendStatus(200);

  if (event.source?.userId) savedUserId = event.source.userId;
  const replyToken = event.replyToken;

  if (event.message?.type === 'location') {
    const { latitude: lat, longitude: lon, address, title } = event.message;
    const { text } = await getWeatherInfo(lat, lon, address || title || "ตำแหน่งที่ปักหมุด");
    await lineApi('reply', replyToken, [{ type: 'text', text }]);
  } else {
    const msg = event.message?.text?.trim().normalize('NFC') || "";
    
    if (/^(check|เช็ค)$/i.test(msg)) {
      latestCommand = "check";
      await lineApi('reply', replyToken, [{ type: 'text', text: "🔄 กำลังเรียกข้อมูลจาก NodeMCU..." }]);
    } else if (/^(weather|สภาพอากาศ|เช็คสภาพอากาศ)$/i.test(msg)) {
      // ดึง 2 ที่พร้อมกัน (เร็วกว่าเดิม 2 เท่า)
      const [k, v] = await Promise.all([getWeatherInfo("16.419", "101.1606", "เขาค้อ-ภูทับเบิก จ.เพชรบูรณ์"), getWeatherInfo("15.195", "104.872", "อ.วารินชำราบ จ.อุบลราชธานี")]);
      await lineApi('reply', replyToken, [{ type: 'text', text: k.text }, { type: 'text', text: v.text }]);
    } else if (IOT_COMMANDS.has(msg)) {
      latestCommand = msg;
      await lineApi('reply', replyToken, [{ type: 'text', text: `⚙️ ส่งคำสั่ง [${msg}] ไปยังอุปกรณ์แล้ว` }]);
    } else {
      await lineApi('reply', replyToken, [{ type: 'text', text: `❓ ไม่พบคำสั่ง [${msg}] ในระบบ` }]);
    }
  }
  res.sendStatus(200);
});

// 6. Endpoint ดึงข้อมูลของ NodeMCU
app.get('/command', (req, res) => {
  res.send(latestCommand);
  if (latestCommand !== "OFF") latestCommand = "OFF"; 
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
