let blockedSongList = document.getElementById("blocked-songs");

var currentlyPlaying = null;

const SPACE = "&nbsp;"

var updateN = 0;
var blockedSongs = [];
var updateTime = 0;

function getCurrentlyPlaying() {
  return new Promise((res, rej) => {
    fetch(generateURL("/api/get_current"))
      .then(response => response.json())
      .then(json => {
        if (json.success) {
          currentlyPlaying = json.data;

          let thisUpdate = updateN + 1;

          if (currentlyPlaying.isPlaying) {
            for (let i = 1; i < Math.floor(currentlyPlaying.updateTime / 1000); i++) {
              setTimeout(() => {
                if (thisUpdate < updateN) return;
                currentlyPlaying.times.progress += 1000;
                formatCurrentlyPlaying();
              }, i * 1000)
            }
          }

          updateTime = Math.floor(currentlyPlaying.updateTime / 1000) * 1000;
          formatCurrentlyPlaying()

          updateN++;
          res('')
        }
      })
  })
}

function getSongsBySearch(song) {
  return new Promise((res, rej) => {
    fetch(generateURL("/api/search_song?song=" + encodeURIComponent(song)))
    .then(response => response.json())
    .then(json => {
      res(json)
    });
  })
}

function getBlockedSongs() {
  return new Promise((res, rej) => {
    fetch(generateURL("/api/blocked_songs"))
    .then(response => response.json())
    .then(json => {
      res(json)
    });
  })
}

async function blockSong(info, remove=false) {
  let response = await fetch(generateURL("/api/block_song"), {
    method: 'post',
    mode: 'same-origin',
    cache: 'no-cache',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json'
    },
    redirect: 'follow',
    referrerPolicy: 'no-referrer',
    body: JSON.stringify({
      info,
      remove
    })
  });

  return response;
}

function formatCurrentlyPlaying() {
  if (currentlyPlaying.pubDetails.name == "") {
		document.querySelector("#song-title").textContent = "Not listening to anything currently."
		document.querySelector("#song-name").textContent = "";
		document.querySelector("#song-artists").textContent = "";
		document.querySelector("#song-photo").src = "";

		return;
	}

  document.querySelector("#song-title").textContent = "(" + ((currentlyPlaying.isPlaying) ? "Playing" : "Paused") + ") Currently Listening to:"

  document.querySelector("#song-name").textContent = currentlyPlaying.pubDetails.name;
  document.querySelector("#song-artists").textContent = formatArtists(currentlyPlaying.pubDetails.by);

  document.querySelector("#song-photo").src = currentlyPlaying.context.album.coverArt;

  document.querySelector("#progress-text").textContent = toSongTime(currentlyPlaying.times.progress) + " / " + toSongTime(currentlyPlaying.times.len);

  document.querySelector("#song-progress").max = currentlyPlaying.times.len;
	document.querySelector("#song-progress").value = currentlyPlaying.times.progress;
}

var flip = true,
   pause = "M11,10 L18,13.74 18,22.28 11,26 M18,13.74 L26,18 26,18 18,22.28",
   play = "M11,10 L17,10 17,26 11,26 M20,10 L26,10 26,26 20,26",
   $animation = $('#animation');

//https://codepen.io/kucerajacob/pen/WvPrJL
// $(".ytp-play-button").on('click', function() {
//   flip = !flip;
//   $animation.attr({
//      "from": flip ? pause : play,
//      "to": flip ? play : pause
//   }).get(0).beginElement();
// });

window.onload = function() {
  getCurrentlyPlaying().then(_ => {
    console.log("Updating every " + updateTime + "ms.")
    setInterval(() => {
      getCurrentlyPlaying().then(__ => {

        if (flip != currentlyPlaying.isPlaying) {
          flip = currentlyPlaying.isPlaying;
          $animation.attr({
              "from": flip ? pause : play,
              "to": flip ? play : pause
          }).get(0).beginElement();
        }
      });
    }, updateTime)

    if (flip != currentlyPlaying.isPlaying) {
      flip = currentlyPlaying.isPlaying;
      $animation.attr({
          "from": flip ? pause : play,
          "to": flip ? play : pause
      }).get(0).beginElement();
    }
  });

  setTimeout(() => {
    getBlockedSongs().then(songs => {
      blockedSongs = songs;
      formatBlockedSongs();
    })
  }, 1000)

  setTimeout(() => {
    if (document.querySelector("#song-title").textContent == "No data yet.") {
      location.reload();
    }
  }, 500)
}

var currentSearch = "";

var songList = document.querySelector("#search-songs");

function blockSongPopup() {
  $('#block-song-popup').modal('show')

  if (currentSearch == "") {
    songList.innerHTML = "<li><i>Songs will appear here...</i></li>";
  }
}

document.querySelector("#song-search").addEventListener('input', onSearchChange);

function onSearchChange(e) {
  var value = document.querySelector('#song-search').value;
  currentSearch = value;

  if (currentSearch != "") {
    if (document.getElementsByClassName("search-song-empty").length == 0) {
      songList.innerHTML = "";

      for (let i = 0; i < 10; i++) {
        let li_ = createEle("li")
        let box = createEle("div")
        let emptyName = createEle("p")
        let emptyArtist = createEle("span")

        box.classList.add("search-song-empty-box")
        emptyName.innerHTML = gap(90);
        emptyName.classList.add("search-song-empty")
        emptyArtist.innerHTML = gap(80);
        emptyArtist.classList.add("search-song-empty")

        li_.appendChild(box)
        li_.appendChild(emptyName)
        emptyName.appendChild(createEle("br"))
        emptyName.appendChild(emptyArtist)

        li_.classList.add("search-song")

        songList.appendChild(li_)
      }
    }

    setTimeout(() => {
      if (value == document.querySelector('#song-search').value) {
        getSongsBySearch(value).then(songs => {
          if (document.querySelector('#song-search').value == "" || value != document.querySelector('#song-search').value) return;
          
          songList.innerHTML = "";

          for (let song of songs) {
            let li = createEle("li")
            let image = createEle("img")
            let name = createEle("p")
            let artist = createEle("span")

            let id = song.external_ids.isrc;

            image.src = song.album.images[2].url
            image.classList.add("search-song-image")
            name.textContent = song.name
            name.classList.add("search-song-name")
            artist.textContent = formatArtists(song.artists)
            artist.classList.add("search-song-artists")
            
            if (hasBlockedSong(id)) {
              li.style.backgroundColor = "#bf877c";
            }

            li.appendChild(image)
            li.appendChild(name)
            li.onclick = () => {
              onSongClick(id, song.name, formatArtists(song.artists), song.album.images[2].url);
            }
            name.appendChild(createEle("br"))
            name.appendChild(artist)

            li.classList.add("search-song")

            songList.appendChild(li)
          }
        })
      }
    }, 200)
  } else {
    songList.innerHTML = "<li><i>Songs will appear here...</i></li>";
  }
}

function closePopup() {
  $('#block-song-popup').modal('hide')
}

function generateURL(page) {
  return "http://localhost:" + port + (page.startsWith("/") ? "" : "/") + page;
}

function formatArtists(by) {
  let artists = "";
  for (let i = 0; i < by.length; i++) {
    if (i == 0) {
      artists += by[i].name;
    } else {
      artists += ", " + by[i].name;
    }
  }

  return artists;
}

function onSongClick(id, name, by, artLink) {
  let removingSong = false;

  let info = {
    id,
    info: {
      name,
      by,
      artLink
    }
  }

  if (hasBlockedSong(id)) {
    removingSong = true;
    blockedSongs.splice(blockedSongs.findIndex(ele => info.id == ele.id), 1);
  } else {
    if (!hasBlockedSong(info.id)) blockedSongs.push(info)
  }

  try {
    blockSong(info, removingSong)
  } catch (e) {console.log("err")}

  document.querySelector('#song-search').value = "";
  onSearchChange(null);
  closePopup();

  setTimeout(() => {
    formatBlockedSongs();

    if (!removingSong) {
      document.querySelector("#alert-content").innerHTML = "Blocked \"<b>" + info.info.name + "</b>\" by " + info.info.by + ".";
    } else {
      document.querySelector("#alert-content").innerHTML = "Unblocked \"<b>"  + info.info.name + "</b>\" by " + info.info.by + ".";
    }

    document.querySelector("#alert-box").classList.add("blocked-song-alert-shown")
    document.querySelector("#alert-box").classList.remove("blocked-song-alert-hidden")

    setTimeout(() => {
      document.querySelector("#alert-box").classList.remove("blocked-song-alert-shown")
      document.querySelector("#alert-box").classList.add("blocked-song-alert-hidden")
    }, 2000)
  }, 100)

}

function formatBlockedSongs() {
  blockedSongList.innerHTML = "";
  for (let bs of blockedSongs) {
    let li = createEle("li")
    let image = createEle("img")
    let name = createEle("p")
    let artist = createEle("span")

    image.src = bs.info.artLink;
    image.classList.add("blocked-song-image")
    name.textContent = bs.info.name;
    name.classList.add("blocked-song-name")
    artist.textContent = bs.info.by;
    artist.classList.add("blocked-song-artists")

    li.appendChild(image)
    li.appendChild(name)
    li.onclick = () => {
      onSongClick(bs.id, bs.info.name, bs.info.by, bs.info.artLink);
    }

    name.appendChild(createEle("br"))
    name.appendChild(artist)

    li.classList.add("blocked-song")

    blockedSongList.appendChild(li)
  }
}

function formatArtistsFormally(by) {
  let artists = "";
  for (let i = 0; i < by.length; i++) {
    if (i == by.length - 1) {
      if (by.length == 1) return by[i].name;

      if (by.length == 2) {
        artists += " and " + by[i].name;
      } else {
        artists += ", and " + by[i].name;
      }
    } else if (i == 0) {
      artists += by[i].name;
    } else {
      artists += ", " + by[i].name;
    }
  }

  return artists;
}

function createEle(tag) {
  return document.createElement(tag);
}

function toSongTime(num) {
	num = num / 1000;
	let s = num / 60;
	let m = 0;
	let h = 0;
	if (s >= 1) {
		m = Math.floor(s);
		s = s - m;
	}
	s = 60 * s;
	if (m > 60) {
		h = Math.floor(m / 60);
		m = m - (h * 60);
	}
	return ((h > 0) ? h + ":" : "") + m + ":" + ((s < 10) ? "0" : "") + Math.floor(s);
}

function gap(len) {
  let str = "";
  for (let i = 0; i < len; i++) str += SPACE;
  return str;
}

function hasBlockedSong(id) {
  for (let blockedSong of blockedSongs) {
    if (blockedSong.id == id) return true;
  }
  return false;
}