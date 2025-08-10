
Render deployment guide

Prereqs
1. GitHub account
2. Render account

Steps
1. Put the repository root exactly like this
   server
   client
   render.yaml

2. Commit and push to GitHub

3. In Render create a new Web Service from repo
   Render reads render.yaml and sets everything automatically
   Service type web
   Environment node
   Root directory server
   Build command npm install
   Start command node index.js
   Health check path slash health

4. First deploy
   Wait for build to finish
   Open the live URL from Render
   Create a room then share the link or code

Optional custom domain
1. Add a custom domain in Render settings
2. Update DNS A and CNAME as instructed
3. Wait for SSL to finish

Notes
1. WebSockets work by default on Render
2. PORT is provided by Render so no manual env needed
3. The server serves the static client from the client folder by relative path
