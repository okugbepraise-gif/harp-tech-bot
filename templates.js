const fs = require('fs');

function generateSiteHTML(tier, sitename) {
  const config = JSON.parse(fs.readFileSync('./web_config.json', 'utf-8'));
  const tierData = config.tiers[tier];
  
  if (!tierData) return '<h1>Error: Invalid tier</h1>';

  const baseHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${sitename} - Powered by HARPS TECH</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
   .hero { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 100px 20px; text-align: center; }
   .hero h1 { font-size: 3rem; margin-bottom: 20px; }
   .hero p { font-size: 1.2rem; margin-bottom: 30px; }
   .btn { display: inline-block; padding: 15px 30px; background: #25D366; color: white; text-decoration: none; border-radius: 50px; font-weight: bold; transition: 0.3s; }
   .btn:hover { transform: scale(1.05); }
   .container { max-width: 1200px; margin: 0 auto; padding: 60px 20px; }
   .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 30px; margin: 40px 0; }
   .feature { background: #f8f9fa; padding: 30px; border-radius: 10px; text-align: center; }
   .feature h3 { color: #667eea; margin-bottom: 15px; }
    footer { background: #2c3e50; color: white; text-align: center; padding: 40px 20px; }
   .badge { position: fixed; bottom: 20px; right: 20px; background: #000; color: #fff; padding: 10px 15px; border-radius: 20px; font-size: 12px; z-index: 999; }
   .badge a { color: #667eea; text-decoration: none; }
  </style>
</head>
<body>
  <div class="hero">
    <h1>Welcome to ${sitename}</h1>
    <p>${tierData.name} Package by HARPS TECH</p>
    <a href="https://wa.me/2348141612736" class="btn">💬 Chat on WhatsApp</a>
  </div>

  <div class="container">
    <h2 style="text-align: center; margin-bottom: 40px;">Why Choose Us</h2>
    <div class="features">
      <div class="feature">
        <h3>⚡ Fast</h3>
        <p>Lightning fast loading speed optimized for all devices</p>
      </div>
      <div class="feature">
        <h3>📱 Mobile Ready</h3>
        <p>100% responsive design that looks perfect on any screen</p>
      </div>
      <div class="feature">
        <h3>🔒 Secure</h3>
        <p>SSL secured with GitHub Pages hosting</p>
      </div>
      ${tier >= 2? `
      <div class="feature">
        <h3>📧 Contact Form</h3>
        <p>Get messages directly from your customers</p>
      </div>` : ''}
      ${tier >= 3? `
      <div class="feature">
        <h3>💳 E-commerce</h3>
        <p>Sell products online with Paystack integration</p>
      </div>` : ''}
      ${tier >= 4? `
      <div class="feature">
        <h3>🤖 Bot Integration</h3>
        <p>Connect your WhatsApp bot for 24/7 customer service</p>
      </div>` : ''}
    </div>

    <div style="text-align: center; margin-top: 60px;">
      <h2>Package: ${tierData.name}</h2>
      <p style="font-size: 1.1rem; margin: 20px 0;">${tierData.features}</p>
      <p><strong>Pages:</strong> ${tierData.pages}</p>
    </div>
  </div>

  <footer>
