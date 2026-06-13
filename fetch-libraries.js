const https = require("https");

function fetchPage(idx) {
  return new Promise((resolve) => {
    https.get("https://lib.dongjak.go.kr/dj/html.do?menu_idx=" + idx, function(res) {
      let data = "";
      res.on("data", function(c) { data += c; });
      res.on("end", function() {
        const addrMatch = data.match(/주소.*?<\/strong>(.*?)<\/li>/s);
const addr = addrMatch ? [addrMatch[1].trim()] : null;
        const menu = data.match(/class="on"[^>]*>([^<]+)<\/a>/);
        if (addr) {
          const libName = menu ? menu[1].trim() : "?";
          console.log("[" + idx + "] " + libName + " | " + addr[0].trim());
        }
        resolve();
      });
    }).on("error", function() { resolve(); });
  });
}

async function main() {
  for (let i = 1; i <= 800; i++) {
    await fetchPage(i);
    await new Promise(function(r) { setTimeout(r, 300); });
  }
}

main();