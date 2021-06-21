const { rejects } = require('assert');
const { app, BrowserWindow, ipcMain, shell } = require('electron')
const fs = require("fs");
const path = require('path');
const { createNewRequest, getAuthHeader } = require('./spotifyHandler.js')

var jsonParser = require('body-parser').json();

var spotifyData = null;
var createdRequestHandler = false;
var spotifyHandler = null;
var blocked_ = null;

//// TODO: remove like most of these lol
var scopes = [
	"user-library-read",
	"user-top-read",
	"user-read-playback-position",
	"user-read-recently-played",
	"playlist-read-private",
	"playlist-read-collaborative",
	"user-read-currently-playing",
  'user-modify-playback-state',
  'user-read-playback-state',

	"streaming",
].join(" ");

console.log("Starting...")

loadCodesFromFile().then(codes => {
  spotifyData = {
    CLIENT_ID: codes.CLIENT_ID,
    CLIENT_SECRET: codes.CLIENT_SECRET,
    REDIRECT_URI: `http://localhost:XXXX/callback`
  }

  blocked_ = codes.blocked;

  console.log("Loaded codes from file.")

  require("./pages.js")().then(pages => {
    console.log("Loaded " + pages.length + " pages.")

    require("./startServer.js")(pages, (app, port_) => {
      app.get('/auth', (req, res) => {
        let link = 'https://accounts.spotify.com/authorize' +
    	  '?response_type=code' +
    	  '&client_id=' + spotifyData.CLIENT_ID +
    	  (scopes ? '&scope=' + encodeURIComponent(scopes) : '') +
    	  '&redirect_uri=' + encodeURIComponent(`http://localhost:${port_}/callback`);

        res.send(`<meta http-equiv="refresh" content="0; URL='${link}'"/><a href="${link}">If redirecting isn't working, click here to go to the page.</a>`)
      })

      app.get('/callback', (req, res) => {
        let authCode = req.query.code || null;
        let state = req.query.state || null;

        if (authCode == null) { console.log("Err: Auth Code is null"); process.exit(1); }

        onSpotifyData(spotifyData, authCode, state)

        res.send(`<body onload="closePage()"><h1>You can close this page.</h1><script>function closePage() {setTimeout(() => {window.open("", '_self').window.close();}, 500)}</script></body>`)
      });

      app.get('/api/get_current', (req, res) => {
        if (createdRequestHandler && spotifyHandler) {
          res.json({
            success: true,
            data: spotifyHandler.currentlyPlaying
          })
        } else {
          res.json({
            success: false,
            data: {}
          })
        }
      })

      app.get('/api/search_song', jsonParser, (req, res) => {
        let song = decodeURIComponent(req.query.song);

        spotifyHandler.search(song).then(items => {
          res.json(items)
        })
      })

      app.get('/api/blocked_songs', (req, res) => {
        if (spotifyHandler) {
          res.json(spotifyHandler.blockedSongs)
        } else {
          res.json([])
        }
      })

      app.post('/api/block_song', jsonParser, (req, res) => {
        let songInfo = req.body.info;
        let toRemove = req.body.remove || false;

        if (!toRemove) {
          if (!spotifyHandler.hasBlockedSong(songInfo.id)) spotifyHandler.blockedSongs.push(songInfo)
        } else if (spotifyHandler.blockedSongs.findIndex(ele => songInfo.id == ele.id) > -1) {
          spotifyHandler.blockedSongs.splice(spotifyHandler.blockedSongs.findIndex(ele => songInfo.id == ele.id), 1);
        }

        saveSongs()

        res.status(200)
        res.send(JSON.stringify({ success: true }))
      })

      return app;
    }).then(port_ => {
      port = port_;

      spotifyData.REDIRECT_URI = `http://localhost:${port}/callback`;

      waitTillAppReady().then(v => {
        if (v) createWindow();
      }).catch(err => {
        console.log("Could not load window.")
      })
    }).catch(err => {
      console.log("Error while starting server. Error:")
      console.error(err);
    });
  }).catch(err => {
    console.log("Error while loading pages. Error:")
    console.error(err);
  });
})


var port = -1;
var appReady = false;
var createdFirstPage = false;

function createWindow() {
  if (port == -1) {
    console.error("Port is -1, could not start program.")
    return;
  }

  createdFirstPage = true;

  let options = {
    width: 1000,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      enableRemoteModule: true,
      contextIsolation: false,
    },
    frame: true
  };

  win = new BrowserWindow(options);

  win.loadURL(generateURL("/"))

  win.once('ready-to-show', () => {
    if (!createdRequestHandler) {
      shell.openExternal(`http://localhost:${port}/auth`);
    }
  });
}

function generateURL(location) {
  return `http://localhost:${port}${(location.startsWith("/") ? location : '/' + location)}`
}

function waitTillAppReady() {
  return new Promise((resolve, reject) => {
    let tries = 0;
    let intr_ = setInterval(() => {
      if (appReady) {
        clearInterval(intr_);
        resolve(true)
        return;
      }

      if (tries > 50) {
        console.log("App took too long to load.")
        clearInterval(intr_)
        reject(false)
      }

      tries++;
    }, 100)
  })
}

app.whenReady().then(() => {
  appReady = true;

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && createdFirstPage) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
});

function loadCodesFromFile() {
  return new Promise((resolve, reject) => {
    fs.readFile(path.join(__dirname, "codes.json"), (err, data) => {
      if (err) throw err;

      let parsed = JSON.parse(data)

      fs.readFile(path.join(__dirname, "songs.json"), (err, dt) => {
        let blockedSongs = JSON.parse(dt).blocked;

        resolve({CLIENT_ID: parsed.clientID, CLIENT_SECRET: parsed.clientSecret, blocked: blockedSongs})
      })
    })
  })
}

async function saveSongs() {
  await fs.writeFileSync(path.join(__dirname, "songs.json"), JSON.stringify({
    blocked: spotifyHandler.blockedSongs
  }))
}

async function onSpotifyData(data, authCode, state) {
  console.log("Recieved Spotify tokens, loading...")

  createdRequestHandler = true;

  spotifyHandler = await createNewRequest({
    authorizationCode: authCode,
    state,
    authHeader: getAuthHeader(data.CLIENT_ID, data.CLIENT_SECRET),
    REDIRECT_URI: data.REDIRECT_URI,

    CLIENT_ID: data.CLIENT_ID,
    CLIENT_SECRET: data.CLIENT_SECRET,

    blocked: blocked_
  })

  console.log("Created Spotify handler.")
}