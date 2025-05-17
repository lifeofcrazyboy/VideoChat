# Stranger Video Chat

A simple Omegle-style video chat application with gender-based matching.

## Features

- Gender selection and matching
- 1-on-1 video calls
- Real-time text chat
- Simple, clean UI
- Responsive design for mobile and desktop

## How to Run Locally

1. Clone this repository
2. Install dependencies: `npm install`
3. Start the server: `npm start`
4. Open `http://localhost:3000` in your browser

## How to Deploy

### Render
1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Set the build command to `npm install`
4. Set the start command to `node server.js`
5. Deploy!

### Vercel
1. Create a new project on Vercel
2. Import your GitHub repository
3. Set the build command to `npm install`
4. Set the output directory to `public`
5. Add a rewrite rule: `source: /(.*)`, `destination: /public/index.html`
6. Deploy!

## Notes

- You may need to configure HTTPS for WebRTC to work properly on some platforms
- For production use, consider adding more robust error handling and logging
- The app uses public STUN servers which may have limitations
