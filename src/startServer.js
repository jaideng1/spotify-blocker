const express = require("express");
const request = require("request");

const BASE_PORT = 5555;

function portInUse(port) {
  return new Promise((resolve, reject) => {
    request("http://localhost:" + port, (err, response, body) => {
      if (err) {
        resolve(false);
      } else resolve(true);
    })
  })
}

async function findOpenPort() {
  let portToUse = BASE_PORT;
  for (let i = 0; i < 10; i++) {
    let portNotAvaliable = await portInUse(portToUse);

    if (!portNotAvaliable) break;

    portToUse += 1;

    if (i == 9) portToUse = -1;
  }

  console.log("Found open port: " + portToUse)

  return new Promise((resolve, reject) => {
    if (portToUse > 0) {
      resolve(portToUse)
    } else reject("Tried to find a port 10 times, none was found.")
  })
}

async function startServer(pages, additions = function(app) { return app; }) {
  let PORT_TO_USE = await findOpenPort();

  if (typeof PORT_TO_USE === "string") {
    return new Promise((resolve, reject) => { reject(PORT_TO_USE) })
  }

  return new Promise((resolve, reject) => {
    let app = express();

    app.set('view engine', 'ejs');

    for (let page of pages) {
      var port = PORT_TO_USE;

      app.get('/' + page.hostAs, (req, res) => {
        //Use EJS if it's an EJS file, if not just send the file directly.
        if (page.location.includes(".ejs")) {
          res.render(page.location, {
            port: port
          });
        } else {
          res.sendFile(page.location);
        }
      });
    }

    let appCopy = app;

    app = additions(app, port);

    if (app == null) app = appCopy;

    app.listen(PORT_TO_USE, () => {
      console.log("\n")
      console.log("Server started on port " + PORT_TO_USE + ".");

      resolve(PORT_TO_USE)
    });
  })
}

module.exports = startServer;
