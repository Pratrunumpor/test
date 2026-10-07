const express = require('express');
const app = express();
app.use(express.json());

let latestCommand = "OFF";

// ฟังก์ชันดึงข้อมูลพระอาทิตย์ขึ้น-ตกจาก API ภายนอก
async function getSunInfo() {
  try {
    // ใช้ fetch (มีมาให้ใน Node.js เวอร์ชันใหม่ๆ บน Render) พิกัดตัวอย่าง: กรุงเทพฯ (Lat: 13.7563, Lng: 100.5018)
    // หรือถ้าอยู่จังหวัดอื่นสามารถเปลี่ยนค่า lat และ lng ได้ครับ
    const response = await fetch('https://api.sunrise-sunset.org/json?lat=15.2285&lng=104.8569&formatted=0');
    const data = await response.json();
    
    if (data.status === "OK") {
      // แปลงเวลา UTC จาก API ให้เป็นเวลาไทย (+7 ชั่วโมง)
      const sunriseUTC = new Date(data.results.sunrise);
      const sunsetUTC = new Date(data.results.sunset);
      
      const sunriseTH = new Date(sunriseUTC.getTime() + (7 * 60 * 60 * 1000)).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
      const sunsetTH = new Date(sunsetUTC.getTime() + (7 * 60 * 60 * 1000)).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

      return {
        sunrise: sunriseTH + " น.",
        sunset: sunsetTH + " น."
      };
    }
  } catch (error) {
    console.error("Error fetching sun data:", error);
  }
  return { sunrise: "06:08 น.", sunset: "18:05 น." }; // ค่าสำรองเผื่อต่อเน็ตไม่ได้
}

app.post('/webhook', (req, res) => {
  const events = req.body.events;
  if (events && events.length > 0) {
    const userMessage = events[0].message.text.trim();
    if (userMessage === "เปิด" || userMessage === "ON") {
      latestCommand = "ON";
    } else if (userMessage === "ปิด" || userMessage === "OFF") {
      latestCommand = "OFF";
    } else if (userMessage === "check" || userMessage === "เช็ค") {
      latestCommand = "check";
    }
  }
  res.sendStatus(200);
});

// เมื่อ NodeMCU มาขอคำสั่ง /command
app.get('/command', async (req, res) => {
  if (latestCommand === "check") {
    // ถ้าเป็นคำสั่ง check ให้ดึงข้อมูลพระอาทิตย์จาก API ภายนอกมารวมส่งกลับไป
    const sunData = await getSunInfo();
    const responseText = `check|☀️ พระอาทิตย์ขึ้น: ${sunData.sunrise}\n🌅 พระอาทิตย์ตก: ${sunData.sunset}`;
    res.send(responseText);
    latestCommand = "OFF"; // เคลียร์ค่ากลับ
  } else {
    res.send(latestCommand);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
