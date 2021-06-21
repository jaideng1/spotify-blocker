const fs = require("fs")
const path = require("path")

const PAGES_PATH = path.join(__dirname, "/pages");

class Page {
  constructor(location, hostAs) {
    this.location = location;
    this.hostAs = hostAs;
    if (this.hostAs == "home.ejs") this.hostAs = "";
  }
}

function loadPages() {
  return new Promise((resolve, reject) => {
    fs.readdir(PAGES_PATH, (err, files) => {
      if (err) {
        reject(err);
        return;
      }

      let pages = [];

      let i = 0;
      for (let file of files) {
        let filePath = path.join(PAGES_PATH, file);

        fs.lstat(filePath, (err, stats) => {
          if (err) throw err;

          if (!stats.isDirectory()) {
            pages.push(new Page(filePath, file));

            if (i == files.length) resolve(pages);
          } else {
            fs.readdir(filePath, (err, files_) => {
              for (let file_ of files_) {
                pages.push(new Page(path.join(filePath, file_), file_));
              }

              if (i == files.length) resolve(pages);
            })
          }
        })

        i++;
      }
    });
  });
}

module.exports = loadPages;
