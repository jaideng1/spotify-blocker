/*
* Spotify Blocker
* Made by jaideng1
* Link: https://github.com/jaideng1/spotify-blocker
*/

const { rejects } = require('assert');
const { app, BrowserWindow, ipcMain, shell } = require('electron')
const fs = require("fs");
const path = require('path');
const colors = require('colors');
const { createNewRequest, getAuthHeader } = require('./spotifyHandler.js')

var jsonParser = require('body-parser').json();

var spotifyData = null,
    createdRequestHandler = false,
    spotifyHandler = null,
    blocked_ = null;

// TODO: remove like most of these lol
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

var APPLICATION_DATA_PATH = process.env.APPDATA || "NOT_STORED_IN_ENV";

//Could've done a one-liner, but it's easier to see like this.
if (APPLICATION_DATA_PATH == "NOT_STORED_IN_ENV") {
  if (process.platform == "darwin") {
    //IK it should prob be different, but yeah
    APPLICATION_DATA_PATH = path.join(process.env.HOME, "/Library");
  } else if (process.platform == "win32") {
    //This is a bit unnecessary, but just in case ¯\_(ツ)_/¯
    APPLICATION_DATA_PATH = path.join(process.env.HOME, "/AppData/Roaming");
  } else if (process.platform == "linux") {
    APPLICATION_DATA_PATH = path.join(process.env.HOME, "/.local/share");
  } else {
    APPLICATION_DATA_PATH = process.env.HOME;
  }
}

console.log("Application Data path set as: " + APPLICATION_DATA_PATH)

var pathTo = {
  codes: path.join(__dirname, "codes.json"),
  songs: path.join(__dirname, "songs.json"),
}

//Check if a .env file exists to set the IN_PRODUCTION variable
var IN_PRODUCTION = true;
inDevelopment().then((bool) => {
  IN_PRODUCTION = !bool;
  console.log("In Production: " + ((IN_PRODUCTION) ? colors.green("true") : colors.red("false")))

  if (IN_PRODUCTION) {
    checkAndCreateApplicationDataFolder().then(() => {
      init();
    });
  } else {
    console.log("Using ./src/*.json as the *.json path.");

    init();
  }
});

/**
 * Init the program.
*/
function init() {
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
}

var port = -1,
    appReady = false,
    createdFirstPage = false;

/**
 * Creates the application window.
*/
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

/**
 * Creates a URL with the localhost and port.
 * @param {string} location 
 * @returns {string}
 */
function generateURL(location) {
  return `http://localhost:${port}${(location.startsWith("/") ? location : '/' + location)}`
}

/**
 * Wait till the app is ready to launch.
 * @returns {Promise}
 */
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

/**
 * Load the blocked songs and codes.json
 * @returns {Promise}
*/
function loadCodesFromFile() {
  return new Promise((resolve, reject) => {
    fs.readFile(pathTo.codes, (err, data) => {
      if (err) throw err;

      let parsed = JSON.parse(data)

      fs.readFile(pathTo.songs, (err, dt) => {
        let blockedSongs = JSON.parse(dt).blocked;

        resolve({CLIENT_ID: parsed.clientID, CLIENT_SECRET: parsed.clientSecret, blocked: blockedSongs})
      })
    })
  })
}

/**
 * Save the blocked songs in songs.json
*/
async function saveSongs() {
  await fs.writeFileSync(pathTo.songs, JSON.stringify({
    blocked: spotifyHandler.blockedSongs
  }))
}

/**
  * Creates the Spotify Handler
  * @param {Object} data
  * @param {string} authCode
  * @param {string} state
*/
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

/**
  * Gets a certain file to see if this is in development or in production
  * @returns {Promise}
*/
function inDevelopment() {
  return new Promise((resolve, reject) => {
    fs.access(path.join(__dirname, "../.gitignore"), fs.F_OK, (err) => {
      if (err) {
        resolve(false);
        return;
      }
      resolve(true);
    })
  });
}

/**
  * Creates the spotify-blocker-data folder if it's not created yet in the app data folder.
*/
function checkAndCreateApplicationDataFolder() {
  let folderPath = path.join(APPLICATION_DATA_PATH, "spotify-blocker-data");

  return new Promise((res, rej) => {
    fs.access(folderPath, (err) => {
      if (err) { //File Doesn't Exist
        console.log("Application data folder for this program doesn't exist, creating it.");
        fs.mkdir(folderPath, { recursive: true }, (err) => {
          if (err) throw err;
          createDataFile(folderPath).then(_ => { res('') })
        })
        return;
      }
      console.log("Application data folder for this program exists. Setting the data path to refer to it.");
      createDataFile(folderPath).then(_ => { res('') })
    });
  })
}

/**
  * Creates the songs.json and the  in the app data folder.
*/
function createDataFile(folderPath) {
  let songs_path = path.join(folderPath, "songs.json");
  let codes_path = path.join(folderPath, "codes.json");

  return new Promise((res, rej) => {
    fs.access(songs_path, (err) => {
      if (err) {
        console.log(colors.red("songs.json doesn't exist, so codes.json also doesn't exist - creating them."))

        fs.writeFile(songs_path, {
          blocked: []
        }, (err) => {
          if (err) throw err;

          console.log(colors.green("✓ Finished writing to " + songs_path));

          fs.writeFile(codes_path, {
            clientID: "",
            clientSecret: ""
          }, (err) => {
            if (err) throw err;
            
            console.log(colors.green("✓ Finished writing to " + codes_path));
            pathTo.codes = codes_path;
            pathTo.songs = songs_path;

            res('');
          })
        })

        return;
      }

      console.log(colors.green("✓ songs.json exists."))
      console.log("Songs Path: " + songs_path)

      pathTo.codes = codes_path;
      pathTo.songs = songs_path;

      res('');
    });
  })
}